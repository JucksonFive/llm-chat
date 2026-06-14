// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from './llm-client'

function makeStreamingResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function makeHandlers() {
  return {
    onToken: vi.fn(),
    onReasoning: vi.fn(),
    onToolCall: vi.fn(),
    onToolResult: vi.fn(),
    onToolError: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
}

const baseParams = {
  agentId: 'agent-1',
  providerId: 'openai' as const,
  model: 'gpt-5.4',
  systemPrompt: 'You are a helper.',
  messages: [{ role: 'user' as const, content: 'hi' }],
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('streamChat', () => {
  it('decodes text-delta events into onToken and finishes via [DONE]', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        'data: {"type":"text-delta","text":"Hello"}\n',
        'data: {"type":"text-delta","text":" world"}\n',
        'data: [DONE]\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onToken).toHaveBeenCalledTimes(2)
    expect(h.onToken).toHaveBeenNthCalledWith(1, 'Hello')
    expect(h.onToken).toHaveBeenNthCalledWith(2, ' world')
    expect(h.onDone).toHaveBeenCalledTimes(1)
    expect(h.onError).not.toHaveBeenCalled()
  })

  it('sends the agent id but not API key material in the chat request', async () => {
    fetchMock.mockResolvedValueOnce(makeStreamingResponse(['data: [DONE]\n']))
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.agentId).toBe('agent-1')
    expect(body).not.toHaveProperty('apiKey')
    expect(body).not.toHaveProperty('awsCredentials')
  })

  it('routes reasoning/tool-call/tool-result events to the right callbacks', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        'data: {"type":"reasoning","text":"thinking..."}\n',
        'data: {"type":"tool-call","toolCallId":"t1","toolName":"calculator","args":{"expression":"1+1"}}\n',
        'data: {"type":"tool-result","toolCallId":"t1","toolName":"calculator","result":2}\n',
        'data: [DONE]\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onReasoning).toHaveBeenCalledWith('thinking...')
    expect(h.onToolCall).toHaveBeenCalledWith({
      toolCallId: 't1',
      toolName: 'calculator',
      args: { expression: '1+1' },
    })
    expect(h.onToolResult).toHaveBeenCalledWith({ toolCallId: 't1', toolName: 'calculator', result: 2 })
    expect(h.onDone).toHaveBeenCalled()
  })

  it('treats any payload with an "error" field as a fatal error (current behavior)', async () => {
    // Note: the server-side may emit { type: 'tool-error', error: '...' } too,
    // but the current client short-circuits on the presence of `error` and
    // calls onError. This test pins that behavior so a future change is
    // explicit.
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        'data: {"type":"tool-error","toolCallId":"t2","toolName":"web-search","error":"oops"}\n',
        'data: [DONE]\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onError).toHaveBeenCalledTimes(1)
    expect((h.onError.mock.calls[0][0] as Error).message).toBe('oops')
    expect(h.onToolError).not.toHaveBeenCalled()
  })

  it('falls back to legacy { text } shape on missing type', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        'data: {"text":"legacy"}\n',
        'data: [DONE]\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onToken).toHaveBeenCalledWith('legacy')
  })

  it('skips lines that do not start with "data: "', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        ': comment line\n',
        'event: ping\n',
        'data: {"type":"text-delta","text":"ok"}\n',
        'data: [DONE]\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onToken).toHaveBeenCalledTimes(1)
    expect(h.onToken).toHaveBeenCalledWith('ok')
  })

  it('skips malformed JSON without crashing', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        'data: {not-valid-json\n',
        'data: {"type":"text-delta","text":"survived"}\n',
        'data: [DONE]\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onToken).toHaveBeenCalledWith('survived')
    expect(h.onError).not.toHaveBeenCalled()
  })

  it('reports server-side error events via onError and stops', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        'data: {"error":"rate limited"}\n',
        'data: {"type":"text-delta","text":"should-not-appear"}\n',
        'data: [DONE]\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onError).toHaveBeenCalledTimes(1)
    expect((h.onError.mock.calls[0][0] as Error).message).toBe('rate limited')
    // Once an error is emitted, the loop returns; later events are ignored.
    expect(h.onToken).not.toHaveBeenCalled()
    expect(h.onDone).not.toHaveBeenCalled()
  })

  it('reports HTTP failures via onError using the response body error message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'bad key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onError).toHaveBeenCalledTimes(1)
    expect((h.onError.mock.calls[0][0] as Error).message).toBe('bad key')
  })

  it('reports HTTP failures with a fallback message when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 500 }))
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onError).toHaveBeenCalledTimes(1)
    expect((h.onError.mock.calls[0][0] as Error).message).toMatch(/HTTP 500|Request failed/)
  })

  it('treats AbortError as a clean done, not an error', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onError).not.toHaveBeenCalled()
    expect(h.onDone).toHaveBeenCalledTimes(1)
  })

  it('flushes onDone if the stream ends without an explicit [DONE]', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamingResponse([
        'data: {"type":"text-delta","text":"partial"}\n',
      ]),
    )
    const h = makeHandlers()

    await streamChat({ ...baseParams, ...h })

    expect(h.onToken).toHaveBeenCalledWith('partial')
    expect(h.onDone).toHaveBeenCalledTimes(1)
  })
})
