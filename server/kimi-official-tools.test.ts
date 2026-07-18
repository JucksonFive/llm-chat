import { describe, expect, it, vi } from 'vitest'
import {
  buildKimiOfficialTools,
  isKimiOfficialToolId,
  KIMI_OFFICIAL_TOOL_CATALOG,
} from './kimi-official-tools.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('KIMI_OFFICIAL_TOOL_CATALOG', () => {
  it('contains the official tools shown in the agent picker', () => {
    expect(KIMI_OFFICIAL_TOOL_CATALOG.map((entry) => entry.id)).toEqual([
      'kimi-web-search',
      'kimi-rethink',
      'kimi-memory',
      'kimi-code-runner',
      'kimi-date',
      'kimi-convert',
      'kimi-random-choice',
      'kimi-excel',
      'kimi-quickjs',
      'kimi-fetch',
      'kimi-base64',
    ])
  })

  it('recognizes only catalog ids', () => {
    expect(isKimiOfficialToolId('kimi-date')).toBe(true)
    expect(isKimiOfficialToolId('web-search')).toBe(false)
  })
})

describe('buildKimiOfficialTools', () => {
  it('loads Formula schemas and executes a Fiber with the original function name', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        tools: [{
          type: 'function',
          function: {
            name: 'convert_units',
            description: 'Convert units',
            parameters: {
              type: 'object',
              properties: { value: { type: 'number' } },
              required: ['value'],
            },
          },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'succeeded',
        context: { output: { value: 1000, unit: 'm' } },
      }))

    const tools = await buildKimiOfficialTools(
      ['kimi-convert'],
      'moonshot-secret',
      { fetchImpl: fetchMock as unknown as typeof fetch, requestTimeoutMs: 0 },
    )

    expect(Object.keys(tools)).toEqual(['kimi_convert_units'])
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.moonshot.ai/v1/formulas/moonshot/convert:latest/tools',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
    const definitionHeaders = fetchMock.mock.calls[0][1].headers as Headers
    expect(definitionHeaders.get('Authorization')).toBe('Bearer moonshot-secret')

    const execute = tools.kimi_convert_units.execute as (
      args: Record<string, unknown>,
      options: never,
    ) => Promise<unknown>
    await expect(execute({ value: 1 }, {} as never)).resolves.toEqual({ value: 1000, unit: 'm' })

    const fiberInit = fetchMock.mock.calls[1][1]
    expect(JSON.parse(fiberInit.body as string)).toEqual({
      name: 'convert_units',
      arguments: JSON.stringify({ value: 1 }),
    })
  })

  it('returns protected encrypted output directly to Kimi', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        tools: [{
          type: 'function',
          function: {
            name: 'web_search',
            parameters: { type: 'object', properties: {} },
          },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'succeeded',
        context: { encrypted_output: '----MOONSHOT ENCRYPTED BEGIN----data----MOONSHOT ENCRYPTED END----' },
      }))

    const tools = await buildKimiOfficialTools(
      ['kimi-web-search'],
      'key',
      { fetchImpl: fetchMock as unknown as typeof fetch, requestTimeoutMs: 0 },
    )
    const execute = tools.kimi_web_search.execute as (
      args: Record<string, unknown>,
      options: never,
    ) => Promise<unknown>

    await expect(execute({}, {} as never)).resolves.toContain('MOONSHOT ENCRYPTED')
  })

  it('does not contact Kimi when no official tools are selected', async () => {
    const fetchMock = vi.fn()
    await expect(
      buildKimiOfficialTools(
        ['calculator'],
        '',
        { fetchImpl: fetchMock as unknown as typeof fetch },
      ),
    ).resolves.toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires an API key when an official tool is selected', async () => {
    await expect(buildKimiOfficialTools(['kimi-date'], '')).rejects.toThrow(
      'A Kimi API key is required',
    )
  })

  it('surfaces Formula HTTP errors without exposing the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ error: { message: 'formula unavailable' } }, 503),
    )

    const request = buildKimiOfficialTools(
      ['kimi-date'],
      'do-not-leak',
      { fetchImpl: fetchMock as unknown as typeof fetch, requestTimeoutMs: 0 },
    )
    await expect(request).rejects.toThrow('formula unavailable')
    await request.catch((error: Error) => {
      expect(error.message).not.toContain('do-not-leak')
    })
  })
})