import type { ProviderId, McpServerConfig, Attachment } from '@/types'

type MessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>

interface StreamChatParams {
  providerId: ProviderId
  model: string
  apiKey: string
  systemPrompt: string
  messages: { role: string; content: MessageContent }[]
  mcpServers?: McpServerConfig[]
  builtInToolIds?: string[]
  thinkingEnabled?: boolean
  thinkingBudget?: number
  signal?: AbortSignal
  onReasoning: (text: string) => void
  onToken: (token: string) => void
  onToolCall: (data: { toolCallId: string; toolName: string; args: Record<string, unknown> }) => void
  onToolResult: (data: { toolCallId: string; toolName: string; result: unknown }) => void
  onToolError: (data: { toolCallId: string; toolName: string; error: string }) => void
  onDone: () => void
  onError: (error: Error) => void
}

export async function streamChat({
  providerId,
  model,
  apiKey,
  systemPrompt,
  messages,
  mcpServers,
  builtInToolIds,
  thinkingEnabled,
  thinkingBudget,
  signal,
  onReasoning,
  onToken,
  onToolCall,
  onToolResult,
  onToolError,
  onDone,
  onError,
}: StreamChatParams) {
  // Timeout: if no data received within 30s, abort
  const TIMEOUT_MS = 30_000
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let receivedData = false

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      if (!receivedData) {
        onError(new Error('Request timed out — no response from the API. Check your API key and network connection.'))
      }
    }, TIMEOUT_MS)
  }

  try {
    resetTimeout()

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, model, apiKey, systemPrompt, messages, mcpServers, builtInToolIds, thinkingEnabled, thinkingBudget }),
      signal,
    })

    if (!response.ok) {
      if (timeoutId) clearTimeout(timeoutId)
      const err = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error || `HTTP ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      receivedData = true
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)

        if (data === '[DONE]') {
          onDone()
          return
        }

        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            onError(new Error(parsed.error))
            return
          }

          switch (parsed.type) {
            case 'reasoning':
              if (parsed.text != null) onReasoning(parsed.text)
              break
            case 'text-delta':
              if (parsed.text != null) onToken(parsed.text)
              break
            case 'tool-call':
              onToolCall({
                toolCallId: parsed.toolCallId,
                toolName: parsed.toolName,
                args: parsed.args,
              })
              break
            case 'tool-result':
              onToolResult({
                toolCallId: parsed.toolCallId,
                toolName: parsed.toolName,
                result: parsed.result,
              })
              break
            case 'tool-error':
              onToolError({
                toolCallId: parsed.toolCallId,
                toolName: parsed.toolName,
                error: parsed.error,
              })
              break
            default:
              // Backward compat: old format without type field
              if (parsed.text) onToken(parsed.text)
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    onDone()
  } catch (error: unknown) {
    if (timeoutId) clearTimeout(timeoutId)
    if (error instanceof DOMException && error.name === 'AbortError') {
      onDone()
      return
    }
    onError(error instanceof Error ? error : new Error('Unknown error'))
  }
}
