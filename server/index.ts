import express from 'express'
import cors from 'cors'
import { streamText, generateText, stepCountIs } from 'ai'
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
import { registerRagRoutes } from './rag/routes.js'
import { streamBedrock } from './bedrock-service.js'
import { logSecurityEvent } from './lib/audit-log.js'
import { findApiKeyForProvider, parseAwsCredentials, resolveApiKeyForAgent } from './api-keys.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

function normalizeDeepSeekModel(model: string): string {
  switch (model) {
    case 'v4-pro':
    case 'deepseek-v4-pro':
      return 'deepseek-v4-pro'
    case 'v4-chat':
    case 'deepseek-v4-chat':
    case 'deepseek-v4-flash':
    case 'deepseek-chat':
      return 'deepseek-v4-flash'
    case 'deepseek-reasoner':
      return 'deepseek-v4-pro'
    default:
      return model
  }
}

type ToolResultForSummary = { toolName: string; result: unknown }

function stringifyForPrompt(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function truncateForPrompt(value: string, maxLength = 6000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}... [truncated]` : value
}

function buildToolResultsPrompt(toolResults: ToolResultForSummary[]): string {
  const renderedResults = toolResults
    .map((toolResult, index) => {
      const result = truncateForPrompt(stringifyForPrompt(toolResult.result))
      return `Tool ${index + 1}: ${toolResult.toolName}\n${result}`
    })
    .join('\n\n')

  return `The tool calls for this turn have already been executed. Do not call more tools. Use these tool results to answer the user's latest request. If a tool returned an error, explain the limitation and answer from the available information.\n\n${renderedResults}`
}

/**
 * Filter out image content from messages for providers that don't support them.
 * DeepSeek and Bedrock (basic Converse API) do not support image_url in messages.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterImagesFromMessages(messages: any[], providerId: string): any[] {
  if (providerId !== 'deepseek' && providerId !== 'bedrock') {
    return messages
  }

  return messages.map((msg) => {
    if (!msg.content || typeof msg.content === 'string') {
      return msg
    }

    if (Array.isArray(msg.content)) {
      let hasImages = false
      const filtered = msg.content.filter((block: unknown) => {
        if (typeof block === 'string') return true
        if (typeof block !== 'object' || block === null) return true
        const blockObj = block as Record<string, unknown>
        if (blockObj.type === 'text') return true
        // Remove image_url blocks
        if (blockObj.type === 'image_url') {
          hasImages = true
          return false
        }
        return true
      })

      if (filtered.length === 0) {
        // If message only had images, add a note
        const providerName = providerId === 'deepseek' ? 'DeepSeek' : 'This provider'
        return {
          ...msg,
          content: `[Image was provided but ${providerName} does not support images in the chat API]`
        }
      }

      if (hasImages && filtered.length > 0) {
        // If there was text + images, keep the text and add a note
        const providerName = providerId === 'deepseek' ? 'DeepSeek' : 'this provider'
        filtered.push({
          type: 'text',
          text: `[Image attachments were removed - ${providerName} does not support images]`
        })
      }

      return {
        ...msg,
        content: filtered
      }
    }

    return msg
  })
}

// DB REST API routes
registerDbRoutes(app)

// RAG (semantic search) routes
registerRagRoutes(app)

// In Electron production, serve the built frontend
// ELECTRON_DIST_PATH is set by the Electron main process
if (process.env.ELECTRON_DIST_PATH) {
  app.use(express.static(process.env.ELECTRON_DIST_PATH))
}

// Tool metadata endpoint
app.get('/api/tools', (_req, res) => {
  res.json({ tools: getBuiltInToolList() })
})

app.post('/api/chat', async (req, res) => {
  let serverTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    const { agentId, providerId, model, messages, systemPrompt, mcpServers, builtInToolIds } = req.body
    const apiKey = providerId === 'ollama' ? '' : resolveApiKeyForAgent(agentId, providerId)
    const toolApiKey = providerId === 'bedrock' ? findApiKeyForProvider('openai') : apiKey

    if (providerId !== 'ollama' && providerId !== 'bedrock' && !apiKey) {
      res.status(400).json({ error: `No API key is stored for ${providerId}. Open the agent settings and add one.` })
      return
    }
    
    // Filter images for providers that don't support them
    const filteredMessages = filterImagesFromMessages(messages, providerId)
    
    const normalizedModel = providerId === 'deepseek' ? normalizeDeepSeekModel(model) : model
    const hasRequestedTools = Boolean((mcpServers?.length ?? 0) > 0 || (builtInToolIds?.length ?? 0) > 0)

    logSecurityEvent('chat.request', {
      agentId,
      providerId,
      model: normalizedModel,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      builtInToolCount: builtInToolIds?.length ?? 0,
      mcpServerCount: mcpServers?.length ?? 0,
    })
    const effectiveModel = providerId === 'deepseek' && normalizedModel === 'deepseek-v4-pro' && hasRequestedTools
      ? 'deepseek-v4-flash'
      : normalizedModel

    // Handle Bedrock separately (doesn't use AI SDK)
    if (providerId === 'bedrock') {
      try {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        const bedrockMessages = filteredMessages.map((msg: { role: string; content: string }) => ({
          role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }))

        // Build tools from MCP servers and built-in tools (same as other providers)
        const mcpTools = mcpServers?.length
          ? await buildToolsFromMcpServers(mcpServers)
          : {}

        const builtIn = builtInToolIds?.length
          ? getBuiltInTools(builtInToolIds as BuiltInToolId[], toolApiKey)
          : {}

        const allTools = { ...builtIn, ...mcpTools }
        const toolNames = Object.keys(allTools)
        const hasTools = toolNames.length > 0

        // Convert Vercel AI SDK tool format to Bedrock format
        const bedrockTools = hasTools
          ? toolNames.map((name) => {
              const tool = allTools[name]
              // AI SDK tools have inputSchema (zod schema), we need the JSON schema
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const inputSchema = (tool as any).inputSchema?.jsonSchema || { type: 'object' as const, properties: {} }
              return {
                name,
                description: tool.description || '',
                inputSchema,
              }
            })
          : undefined

        const awsCredentials = parseAwsCredentials(apiKey)

        console.log(`[chat] provider=bedrock model=${effectiveModel} messages=${bedrockMessages.length} tools=${toolNames.join(',') || 'none'} hasStoredCredentials=${!!awsCredentials}`)

        // Tool calling loop - continue until model stops requesting tools
        const conversationMessages = [...bedrockMessages]
        let turnCount = 0
        const MAX_TURNS = 20 // Prevent infinite loops

        while (turnCount < MAX_TURNS) {
          turnCount++
          const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = []

          for await (const chunk of streamBedrock(
            {
              modelId: effectiveModel,
              region: awsCredentials?.region || process.env.AWS_REGION,
              profile: process.env.AWS_PROFILE,
              accessKeyId: awsCredentials?.accessKeyId,
              secretAccessKey: awsCredentials?.secretAccessKey,
            },
            conversationMessages,
            systemPrompt,
            bedrockTools
          )) {
            if (chunk.type === 'text-delta') {
              res.write(`data: ${JSON.stringify({ type: 'text-delta', text: chunk.text })}\n\n`)
            } else if (chunk.type === 'tool-use' && chunk.toolUseId && chunk.toolName && chunk.toolInput) {
              // Emit tool call event
              res.write(`data: ${JSON.stringify({
                type: 'tool-call',
                toolCallId: chunk.toolUseId,
                toolName: chunk.toolName,
                args: chunk.toolInput,
              })}\n\n`)

              toolCalls.push({
                id: chunk.toolUseId,
                name: chunk.toolName,
                args: chunk.toolInput,
              })
            } else if (chunk.type === 'error') {
              res.write(`data: ${JSON.stringify({ type: 'error', message: chunk.error })}\n\n`)
              res.write('data: [DONE]\n\n')
              res.end()
              return
            } else if (chunk.type === 'done') {
              // If no tool calls, we're done
              if (toolCalls.length === 0) {
                res.write('data: [DONE]\n\n')
                res.end()
                return
              }

              // Execute tool calls
              const toolResults = await Promise.all(
                toolCalls.map(async (call) => {
                  const tool = allTools[call.name]
                  if (!tool) {
                    return {
                      id: call.id,
                      name: call.name,
                      result: { error: `Unknown tool: ${call.name}` },
                      error: true,
                    }
                  }

                  try {
                    // AI SDK tool.execute expects (args, options), we only pass args
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = await (tool as any).execute(call.args, {})
                    res.write(`data: ${JSON.stringify({
                      type: 'tool-result',
                      toolCallId: call.id,
                      toolName: call.name,
                      result,
                    })}\n\n`)
                    return { id: call.id, name: call.name, result, error: false }
                  } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Tool execution failed'
                    res.write(`data: ${JSON.stringify({
                      type: 'tool-error',
                      toolCallId: call.id,
                      toolName: call.name,
                      error: errorMsg,
                    })}\n\n`)
                    return { id: call.id, name: call.name, result: { error: errorMsg }, error: true }
                  }
                })
              )

              // Add assistant message with tool calls + user message with tool results
              conversationMessages.push({
                role: 'assistant' as const,
                content: JSON.stringify({ toolCalls: toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args })) }),
              })
              conversationMessages.push({
                role: 'user' as const,
                content: JSON.stringify({ toolResults: toolResults.map((tr) => ({ id: tr.id, name: tr.name, result: tr.result })) }),
              })

              // Continue loop to get model's response to tool results
              break
            }
          }
        }

        // If we hit max turns, end gracefully
        res.write('data: [DONE]\n\n')
        res.end()
      } catch (error: unknown) {
        console.error('[chat] Bedrock error:', error)
        const message = error instanceof Error ? error.message : 'Bedrock request failed'
        if (!res.headersSent) {
          res.status(500).json({ error: message })
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
          res.end()
        }
      }
      return
    }

    let llmModel
    switch (providerId) {
      case 'openai':
        llmModel = createOpenAI({ apiKey })(effectiveModel)
        break
      case 'anthropic':
        llmModel = createAnthropic({ apiKey })(effectiveModel)
        break
      case 'google':
        llmModel = createGoogleGenerativeAI({ apiKey })(effectiveModel)
        break
      case 'ollama':
        llmModel = createOpenAI({
          baseURL: 'http://localhost:11434/v1',
          apiKey: 'ollama',
          name: 'ollama',
        }).chat(effectiveModel)
        break
      case 'deepseek':
        llmModel = createOpenAI({
          baseURL: 'https://api.deepseek.com',
          apiKey,
          name: 'deepseek',
        }).chat(effectiveModel)
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
      ? getBuiltInTools(builtInToolIds as BuiltInToolId[], toolApiKey)
      : {}

    const tools = { ...builtIn, ...mcpTools }
    const hasTools = Object.keys(tools).length > 0

    console.log(`[chat] provider=${providerId} model=${normalizedModel} effectiveModel=${effectiveModel} messages=${messages.length} tools=${Object.keys(tools).join(',') || 'none'} builtInToolIds=${JSON.stringify(builtInToolIds)}`)

    const abortController = new AbortController()
    serverTimeout = setTimeout(() => {
      console.error('[chat] Server-side timeout after 120s')
      abortController.abort()
    }, 120_000)

    // For non-reasoning models, inject step-by-step thinking discipline
    let finalSystemPrompt = systemPrompt || undefined
    const isReasoningModel = providerId === 'anthropic' || /^(o3|o4|o3-mini|o4-mini|deepseek-v4-pro)/.test(effectiveModel)
    if (finalSystemPrompt && !isReasoningModel) {
      finalSystemPrompt += `\n\n## Mandatory thinking process
For every non-trivial question, you MUST begin your response with a <think>...</think> block before giving your actual answer. This block is your internal reasoning space. Inside it:
1. Restate the core problem in your own words.
2. Identify what you know, what you do not know, and what assumptions you are making.
3. Consider at least 2 different approaches or perspectives. Compare their tradeoffs.
4. Choose the best approach and note why.
5. Plan the structure of your answer.

After the </think> tag, write your actual response to the user. The thinking block ensures you do not give shallow, generic answers.

For trivial factual questions (e.g. "what is 2+2", "what color is the sky"), skip the thinking block and answer directly.`
    }

    if (hasTools && finalSystemPrompt) {
      const toolNames = Object.keys(tools).join(', ')
      finalSystemPrompt += `\n\nYou have access to the following tools: ${toolNames}.

Tool usage guidelines:
- Use tools proactively when the user's question would benefit from real-time data, verification, calculations, or file operations.
- ALWAYS prefer using web_search to verify claims rather than guessing. If you're not sure whether something exists or is correct, search for it first.
- When you use web_search, read the fetched page content carefully and cite sources with URLs.
- If a tool call fails, explain what happened and try an alternative approach.
- Do not fabricate tool results — only report what the tools actually return.
- For large documents (PDFs over ~20 pages or text files over ~50k characters), call index-document once and then search-document with focused queries instead of pdf-reader / file-reader. Pass the documentId from the first result into every search-document call.`
    }

    const result = streamText({
      model: llmModel,
      system: finalSystemPrompt,
      messages: filteredMessages,
      tools: hasTools ? tools : undefined,
      stopWhen: providerId === 'deepseek' && hasTools ? stepCountIs(1) : hasTools ? stepCountIs(20) : stepCountIs(1),
      abortSignal: abortController.signal,
      ...(providerId === 'anthropic' && {
        providerOptions: {
          anthropic: {
            thinking: { type: 'enabled', budgetTokens: 10000 },
          },
        },
      }),
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
    const toolResultsForSummary: ToolResultForSummary[] = []
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
          console.log(`[chat] tool-call: ${part.toolName} (id: ${part.toolCallId})`)
          writeSSE(JSON.stringify({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
          }))
          break
        case 'tool-result':
          console.log(`[chat] tool-result: ${part.toolName} result=${JSON.stringify(part.output).substring(0, 100)}...`)
          writeSSE(JSON.stringify({
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          }))
          toolResultsForSummary.push({ toolName: part.toolName, result: part.output })
          break
        case 'tool-error':
          console.log(`[chat] tool-error: ${part.toolName} error=${part.error}`)
          writeSSE(JSON.stringify({
            type: 'tool-error',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            error: part.error,
          }))
          toolResultsForSummary.push({ toolName: part.toolName, result: `Error: ${part.error}` })
          break
        case 'reasoning-delta':
          writeSSE(JSON.stringify({
            type: 'reasoning',
            text: part.text,
          }))
          break
        case 'reasoning-start':
        case 'reasoning-end':
          break
        case 'finish-step':
          writeSSE(JSON.stringify({ type: 'step-finish' }))
          break
      }
    }

    if (providerId === 'deepseek' && toolResultsForSummary.length > 0) {
      console.log(`[chat] Synthesis triggered. toolResultsForSummary.length=${toolResultsForSummary.length}`, toolResultsForSummary)
      try {
        const synthesisSystemPrompt = finalSystemPrompt
          ? `${finalSystemPrompt}\n\nThe available tools were already called in this turn. Write the final answer using the provided tool results without requesting additional tools.`
          : undefined

        const synthesis = streamText({
          model: llmModel,
          system: synthesisSystemPrompt,
          messages: [
            ...filteredMessages,
            { role: 'user', content: buildToolResultsPrompt(toolResultsForSummary) },
          ],
          stopWhen: stepCountIs(1),
          abortSignal: abortController.signal,
        })

        let synthesisChunkCount = 0
        for await (const part of synthesis.fullStream) {
          typeCounts[`synthesis:${part.type}`] = (typeCounts[`synthesis:${part.type}`] || 0) + 1
          chunkCount++
          synthesisChunkCount++
          switch (part.type) {
            case 'text-delta':
              if (part.text != null) {
                writeSSE(JSON.stringify({ type: 'text-delta', text: part.text }))
              }
              break
            case 'reasoning-delta':
              writeSSE(JSON.stringify({
                type: 'reasoning',
                text: part.text,
              }))
              break
            case 'reasoning-start':
            case 'reasoning-end':
              break
            case 'finish-step':
              writeSSE(JSON.stringify({ type: 'step-finish' }))
              break
          }
        }
        console.log(`[chat] Synthesis stream completed. Received ${synthesisChunkCount} chunks`)
      } catch (synthesisError) {
        console.error(`[chat] Synthesis phase error:`, synthesisError)
        writeSSE(JSON.stringify({
          type: 'error',
          message: `Synthesis phase failed: ${synthesisError instanceof Error ? synthesisError.message : String(synthesisError)}`,
        }))
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
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const data = await parser.getText()
    await parser.destroy()
    res.json({ text: data.text })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'PDF extraction failed' })
  }
})

app.post('/api/extract-memories', async (req, res) => {
  try {
    const { agentId, providerId, model, messages } = req.body
    const apiKey = providerId === 'ollama' ? '' : resolveApiKeyForAgent(agentId, providerId)

    let llmModel
    switch (providerId) {
      case 'openai':
        if (!apiKey) {
          res.json({ memories: { short: [], long: [] } })
          return
        }
        llmModel = createOpenAI({ apiKey })(model.includes('o3') || model.includes('o4') ? 'gpt-4o-mini' : 'gpt-4o-mini')
        break
      case 'anthropic':
        if (!apiKey) {
          res.json({ memories: { short: [], long: [] } })
          return
        }
        llmModel = createAnthropic({ apiKey })('claude-haiku-4-5')
        break
      case 'google':
        if (!apiKey) {
          res.json({ memories: { short: [], long: [] } })
          return
        }
        llmModel = createGoogleGenerativeAI({ apiKey })('gemini-2.5-flash-lite')
        break
      case 'deepseek':
        if (!apiKey) {
          res.json({ memories: { short: [], long: [] } })
          return
        }
        llmModel = createOpenAI({ baseURL: 'https://api.deepseek.com', apiKey, name: 'deepseek' }).chat('deepseek-v4-flash')
        break
      case 'bedrock':
        // Bedrock doesn't support memory extraction yet
        res.json({ memories: { short: [], long: [] } })
        return
      default:
        res.json({ memories: [] })
        return
    }

    const last6 = messages.slice(-6)
    const conversationText = last6
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n\n')

    const { text } = await generateText({
      model: llmModel,
      system: `You extract memories from conversations. Analyze the conversation and return a JSON object with two arrays:

{
  "short": ["recent context items worth remembering for the next few messages"],
  "long": ["permanent facts about the user, their preferences, or important information"]
}

Rules:
- "short" = temporary context: what the user is currently working on, recent decisions, current mood/situation. Max 3 items.
- "long" = permanent facts: user's name, job, preferences, skills, recurring patterns, important life details. Max 2 items.
- Each item is a short sentence (under 20 words).
- Only extract genuinely useful information. Don't extract trivial small talk.
- If nothing is worth remembering, return {"short": [], "long": []}.
- Return ONLY the JSON object, no markdown, no explanation.`,
      prompt: conversationText,
    })

    let memories = { short: [] as string[], long: [] as string[] }
    try {
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      memories = JSON.parse(cleaned)
    } catch {
      console.error('[extract-memories] Failed to parse LLM response:', text)
    }

    res.json({ memories })
  } catch (error) {
    console.error('[extract-memories] Error:', error)
    res.json({ memories: { short: [], long: [] } })
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
