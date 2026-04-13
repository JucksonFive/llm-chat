import express from 'express'
import cors from 'cors'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { buildToolsFromMcpServers } from './tool-bridge.js'
import * as mcpManager from './mcp-manager.js'

const app = express()
app.use(cors())
app.use(express.json())

// In Electron production, serve the built frontend
// ELECTRON_DIST_PATH is set by the Electron main process
if (process.env.ELECTRON_DIST_PATH) {
  app.use(express.static(process.env.ELECTRON_DIST_PATH))
}

app.post('/api/chat', async (req, res) => {
  try {
    const { providerId, model, apiKey, messages, systemPrompt, mcpServers } = req.body

    let llmModel
    switch (providerId) {
      case 'openai':
        llmModel = createOpenAI({ apiKey })(model)
        break
      case 'anthropic':
        llmModel = createAnthropic({ apiKey })(model)
        break
      case 'google':
        llmModel = createGoogleGenerativeAI({ apiKey })(model)
        break
      case 'ollama':
        llmModel = createOpenAI({
          baseURL: 'http://localhost:11434/v1',
          apiKey: 'ollama',
          compatibility: 'compatible',
        }).chat(model)
        break
      case 'deepseek':
        llmModel = createOpenAI({
          baseURL: 'https://api.deepseek.com',
          apiKey,
          compatibility: 'compatible',
        }).chat(model)
        break
      default:
        res.status(400).json({ error: 'Unknown provider' })
        return
    }

    // Build MCP tools if servers are configured
    const tools = mcpServers?.length
      ? await buildToolsFromMcpServers(mcpServers)
      : undefined

    console.log(`[chat] provider=${providerId} model=${model} messages=${messages.length}`)

    const abortController = new AbortController()
    const serverTimeout = setTimeout(() => {
      console.error('[chat] Server-side timeout after 30s')
      abortController.abort()
    }, 30_000)

    const result = streamText({
      model: llmModel,
      system: systemPrompt || undefined,
      messages,
      tools,
      maxSteps: tools ? 10 : 1,
      abortSignal: abortController.signal,
    })

    // Start streaming - don't set SSE headers until we confirm the stream works
    let headersWritten = false
    const writeSSE = (data: string) => {
      if (!headersWritten) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        headersWritten = true
      }
      res.write(`data: ${data}\n\n`)
    }

    let chunkCount = 0
    const typeCounts: Record<string, number> = {}
    for await (const part of result.fullStream) {
      typeCounts[part.type] = (typeCounts[part.type] || 0) + 1
      if (chunkCount < 10) {
        console.log(`[chat] chunk ${chunkCount}: type=${part.type} keys=${Object.keys(part).join(',')}`)
      }
      chunkCount++
      switch (part.type) {
        case 'text-delta':
          if (part.text != null) {
            writeSSE(JSON.stringify({ type: 'text-delta', text: part.text }))
          }
          break
        case 'tool-call':
          writeSSE(JSON.stringify({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.args,
          }))
          break
        case 'tool-result':
          writeSSE(JSON.stringify({
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result,
          }))
          break
        case 'step-finish':
          writeSSE(JSON.stringify({ type: 'step-finish' }))
          break
      }
    }

    clearTimeout(serverTimeout)
    console.log(`[chat] stream done. ${chunkCount} chunks total. types:`, typeCounts)
    writeSSE('[DONE]')
    res.end()
  } catch (error: unknown) {
    clearTimeout(serverTimeout)
    console.error('[chat] Error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    try {
      if (!res.headersSent) {
        res.status(500).json({ error: message })
      } else {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
        res.end()
      }
    } catch {
      // Response already closed, nothing we can do
    }
  }
})

app.post('/api/mcp/test', async (req, res) => {
  try {
    const config = req.body
    const tools = await mcpManager.getTools(config)
    await mcpManager.disconnect(config.id)
    res.json({
      success: true,
      toolCount: tools.length,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Connection failed'
    res.status(400).json({ success: false, error: message })
  }
})

// SPA fallback for Electron production (must come after API routes)
if (process.env.ELECTRON_DIST_PATH) {
  const indexPath = `${process.env.ELECTRON_DIST_PATH}/index.html`
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(indexPath)
  })
}

export function startServer(port = 3001): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const addr = server.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : port
      console.log(`LLM Chat server running on port ${actualPort}`)
      resolve(actualPort)
    })
    server.on('error', reject)
  })
}

// Standalone execution (non-Electron dev mode)
if (!process.env.ELECTRON) {
  const PORT = Number(process.env.PORT) || 3001
  startServer(PORT)
}

process.on('SIGTERM', () => mcpManager.disconnectAll())
process.on('SIGINT', () => {
  mcpManager.disconnectAll().then(() => process.exit(0))
})
