import express from 'express'
import cors from 'cors'
import { streamText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { buildToolsFromMcpServers } from './tool-bridge.js'
import * as mcpManager from './mcp-manager.js'
import { getBuiltInTools, getBuiltInToolList } from './tools/index.js'
import type { BuiltInToolId } from './tools/index.js'
import { MCP_PRESETS } from './mcp-presets.js'
import { initDb, closeDb, flush } from './db.js'
import { registerDbRoutes } from './db-routes.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// DB REST API routes
registerDbRoutes(app)

// In Electron production, serve the built frontend
// ELECTRON_DIST_PATH is set by the Electron main process
if (process.env.ELECTRON_DIST_PATH) {
  app.use(express.static(process.env.ELECTRON_DIST_PATH))
}

app.post('/api/chat', async (req, res) => {
  let serverTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    const { providerId, model, apiKey, messages, systemPrompt, mcpServers, builtInToolIds } = req.body

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
          name: 'ollama',
        }).chat(model)
        break
      case 'deepseek':
        llmModel = createOpenAI({
          baseURL: 'https://api.deepseek.com',
          apiKey,
          name: 'deepseek',
        }).chat(model)
        break
      default:
        res.status(400).json({ error: 'Unknown provider' })
        return
    }

    // Build tools from MCP servers and built-in tools
    const mcpTools = mcpServers?.length
      ? await buildToolsFromMcpServers(mcpServers)
      : {}

    const builtIn = builtInToolIds?.length
      ? getBuiltInTools(builtInToolIds as BuiltInToolId[], apiKey)
      : {}

    const tools = { ...builtIn, ...mcpTools }
    const hasTools = Object.keys(tools).length > 0

    console.log(`[chat] provider=${providerId} model=${model} messages=${messages.length} tools=${Object.keys(tools).join(',') || 'none'} builtInToolIds=${JSON.stringify(builtInToolIds)}`)

    const abortController = new AbortController()
    serverTimeout = setTimeout(() => {
      console.error('[chat] Server-side timeout after 120s')
      abortController.abort()
    }, 120_000)

    // Augment system prompt with tool usage instructions when tools are available
    let finalSystemPrompt = systemPrompt || undefined
    if (hasTools && finalSystemPrompt) {
      const toolNames = Object.keys(tools).map((n) => n.replace('builtin__', '').replace(/_/g, '-')).join(', ')
      finalSystemPrompt += `\n\nYou have access to the following tools: ${toolNames}.

Tool usage guidelines:
- Use tools proactively when the user's question would benefit from real-time data, verification, calculations, or file operations.
- ALWAYS prefer using web-search to verify claims rather than guessing. If you're not sure whether something exists or is correct, search for it first.
- When you use web-search, read the fetched page content carefully and cite sources with URLs.
- If a tool call fails, explain what happened and try an alternative approach.
- Do not fabricate tool results — only report what the tools actually return.`
    }

    const result = streamText({
      model: llmModel,
      system: finalSystemPrompt,
      messages,
      tools: hasTools ? tools : undefined,
      stopWhen: hasTools ? stepCountIs(20) : stepCountIs(1),
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
            args: part.input,
          }))
          break
        case 'tool-result':
          writeSSE(JSON.stringify({
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          }))
          break
        case 'finish-step':
          writeSSE(JSON.stringify({ type: 'step-finish' }))
          break
      }
    }

    clearTimeout(serverTimeout)
    console.log(`[chat] stream done. ${chunkCount} chunks total. types:`, typeCounts)
    writeSSE('[DONE]')
    res.end()
  } catch (error: unknown) {
    if (serverTimeout) clearTimeout(serverTimeout)
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

app.get('/api/tools/built-in', (_req, res) => {
  res.json({ tools: getBuiltInToolList() })
})

app.get('/api/mcp/presets', (_req, res) => {
  res.json({ presets: MCP_PRESETS })
})

app.post('/api/mcp/test', async (req, res) => {
  try {
    const config = req.body
    const tools = await mcpManager.getTools(config)
    const capabilities = await mcpManager.getServerCapabilities(config)

    let resources: { uri: string; name?: string; mimeType?: string }[] = []
    let prompts: { name: string; description?: string }[] = []

    try {
      const r = await mcpManager.getResources(config)
      resources = r.map((r) => ({ uri: r.uri, name: r.name, mimeType: r.mimeType }))
    } catch { /* server may not support resources */ }

    try {
      const p = await mcpManager.getPrompts(config)
      prompts = p.map((p) => ({ name: p.name, description: p.description }))
    } catch { /* server may not support prompts */ }

    await mcpManager.disconnect(config.id)
    res.json({
      success: true,
      capabilities,
      toolCount: tools.length,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
      resourceCount: resources.length,
      resources,
      promptCount: prompts.length,
      prompts,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Connection failed'
    res.status(400).json({ success: false, error: message })
  }
})

app.post('/api/mcp/resources', async (req, res) => {
  try {
    const { servers } = req.body
    const allResources: { uri: string; name?: string; description?: string; mimeType?: string; serverId: string; serverName: string }[] = []
    for (const config of servers) {
      try {
        const resources = await mcpManager.getResources(config)
        allResources.push(...resources.map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
          serverId: config.id,
          serverName: config.name,
        })))
      } catch (err) {
        console.error(`Failed to get resources from "${config.name}":`, err)
      }
    }
    res.json({ resources: allResources })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list resources' })
  }
})

app.post('/api/mcp/resources/read', async (req, res) => {
  try {
    const { serverId, uri } = req.body
    const contents = await mcpManager.readResource(serverId, uri)
    res.json({ contents })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read resource' })
  }
})

app.post('/api/mcp/prompts', async (req, res) => {
  try {
    const { servers } = req.body
    const allPrompts: { name: string; description?: string; arguments?: { name: string; description?: string; required?: boolean }[]; serverId: string; serverName: string }[] = []
    for (const config of servers) {
      try {
        const prompts = await mcpManager.getPrompts(config)
        allPrompts.push(...prompts.map((p) => ({
          name: p.name,
          description: p.description,
          arguments: p.arguments,
          serverId: config.id,
          serverName: config.name,
        })))
      } catch (err) {
        console.error(`Failed to get prompts from "${config.name}":`, err)
      }
    }
    res.json({ prompts: allPrompts })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list prompts' })
  }
})

app.post('/api/mcp/prompts/get', async (req, res) => {
  try {
    const { serverId, name, arguments: args } = req.body
    const prompt = await mcpManager.getPrompt(serverId, name, args)
    res.json(prompt)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get prompt' })
  }
})

app.post('/api/extract-pdf', async (req, res) => {
  try {
    const { dataUrl } = req.body
    const base64 = dataUrl.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')
    const { default: pdfParse } = await import('pdf-parse') as any
    const data = await pdfParse(buffer)
    res.json({ text: data.text })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'PDF extraction failed' })
  }
})

// SPA fallback for Electron production (must come after API routes)
if (process.env.ELECTRON_DIST_PATH) {
  const indexPath = `${process.env.ELECTRON_DIST_PATH}/index.html`
  app.get('{*path}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(indexPath)
  })
}

export async function startServer(port = 3001): Promise<number> {
  await initDb()
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

process.on('SIGTERM', () => {
  flush()
  closeDb()
  mcpManager.disconnectAll()
})
process.on('SIGINT', () => {
  flush()
  closeDb()
  mcpManager.disconnectAll().then(() => process.exit(0))
})
