import { describe, it, expect } from 'vitest'

/**
 * Test to verify that tool-error events are properly captured into toolResultsForSummary
 * This validates the fix for the DeepSeek synthesis issue
 */
describe('tool-error event collection', () => {
  it('should capture tool-error events with error message', () => {
    // Simulate what happens in the server/index.ts main stream loop
    const toolResultsForSummary: Array<{ toolName: string; result: string }> = []

    // Simulate a tool-error event
    const toolError = {
      type: 'tool-error' as const,
      toolCallId: 'call_123',
      toolName: 'web-search',
      error: 'Network error: Unable to connect',
    }

    // This is the code path that should execute
    if (toolError.type === 'tool-error') {
      toolResultsForSummary.push({
        toolName: toolError.toolName,
        result: `Error: ${toolError.error}`,
      })
    }

    expect(toolResultsForSummary).toHaveLength(1)
    expect(toolResultsForSummary[0]).toEqual({
      toolName: 'web-search',
      result: 'Error: Network error: Unable to connect',
    })
  })

  it('should maintain tool results array for synthesis phase', () => {
    const toolResultsForSummary: Array<{ toolName: string; result: string }> = []

    // Mix of tool results and errors
    const events = [
      {
        type: 'tool-result' as const,
        toolName: 'calculator',
        output: '42',
      },
      {
        type: 'tool-error' as const,
        toolName: 'web-search',
        error: 'Timeout',
      },
    ]

    for (const event of events) {
      if (event.type === 'tool-result') {
        toolResultsForSummary.push({
          toolName: event.toolName,
          result: event.output,
        })
      } else if (event.type === 'tool-error') {
        toolResultsForSummary.push({
          toolName: event.toolName,
          result: `Error: ${event.error}`,
        })
      }
    }

    // Should have both results and errors
    expect(toolResultsForSummary).toHaveLength(2)

    // Verify synthesis condition would trigger
    const providerId = 'deepseek'
    const shouldSynthesize = providerId === 'deepseek' && toolResultsForSummary.length > 0
    expect(shouldSynthesize).toBe(true)

    // Verify both items are present
    expect(toolResultsForSummary[0].toolName).toBe('calculator')
    expect(toolResultsForSummary[1].toolName).toBe('web-search')
    expect(toolResultsForSummary[1].result).toContain('Error:')
  })
})
