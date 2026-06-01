// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from './chat-store'
import type { Conversation } from '@/types'

const fetchMock = vi.fn()

function reset() {
  useChatStore.setState({
    conversations: {},
    activeConversationId: null,
    isStreaming: false,
    loaded: false,
  })
}

function seedConversation(overrides: Partial<Conversation> = {}): Conversation {
  const conv: Conversation = {
    id: 'c1',
    agentId: 'a1',
    projectId: null,
    title: 'New conversation',
    messages: [],
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  }
  useChatStore.setState({ conversations: { [conv.id]: conv } })
  return conv
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('addMessage', () => {
  it('appends a message and returns its id', () => {
    seedConversation()
    const id = useChatStore.getState().addMessage('c1', {
      role: 'user',
      content: 'hello',
    })
    expect(typeof id).toBe('string')
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].id).toBe(id)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toBe('hello')
    expect(msgs[0].createdAt).toBeTypeOf('number')
  })

  it('sets streamStartTime for streaming messages (Phase 2)', () => {
    seedConversation()
    const beforeTime = Date.now()
    const id = useChatStore.getState().addMessage('c1', {
      role: 'assistant',
      content: '',
      isStreaming: true,
    })
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].streamStartTime).toBeDefined()
    expect(msgs[0].streamStartTime).toBeGreaterThanOrEqual(beforeTime)
    expect(msgs[0].streamStartTime).toBeLessThanOrEqual(Date.now())
  })

  it('does not set streamStartTime for non-streaming messages (Phase 2)', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', {
      role: 'user',
      content: 'hello',
      isStreaming: false,
    })
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].streamStartTime).toBeUndefined()
  })

  it('sets the conversation title from the first user message (truncated)', () => {
    seedConversation()
    const long = 'a'.repeat(80)
    useChatStore.getState().addMessage('c1', { role: 'user', content: long })
    expect(useChatStore.getState().conversations.c1.title).toBe('a'.repeat(50) + '...')
  })

  it('does not truncate short titles', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'user', content: 'short message' })
    expect(useChatStore.getState().conversations.c1.title).toBe('short message')
  })

  it('does not change the title for non-first messages', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'user', content: 'first' })
    useChatStore.getState().addMessage('c1', { role: 'user', content: 'second' })
    expect(useChatStore.getState().conversations.c1.title).toBe('first')
  })

  it('does not change the title when first message is from assistant', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: 'hi' })
    expect(useChatStore.getState().conversations.c1.title).toBe('New conversation')
  })

  it('is a no-op when the conversation does not exist', () => {
    const id = useChatStore.getState().addMessage('missing', { role: 'user', content: 'x' })
    expect(typeof id).toBe('string') // ID is generated regardless
    expect(useChatStore.getState().conversations).toEqual({})
  })
})

describe('appendToLastMessage', () => {
  it('appends a token to the last message content', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: 'Hi' })
    useChatStore.getState().appendToLastMessage('c1', ', there!')
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].content).toBe('Hi, there!')
  })

  it('sets isGeneratingContent=true on first content token (Phase 2)', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: '', isStreaming: true })
    useChatStore.getState().appendToLastMessage('c1', 'First token')
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].isGeneratingContent).toBe(true)
  })

  it('keeps isGeneratingContent=true on subsequent tokens (Phase 2)', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: 'Hello', isStreaming: true })
    useChatStore.getState().appendToLastMessage('c1', ' world')
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].content).toBe('Hello world')
    expect(msgs[0].isGeneratingContent).toBe(true)
  })

  it('does not set isGeneratingContent for empty content (Phase 2)', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: '', isStreaming: true })
    useChatStore.getState().appendToLastMessage('c1', '')
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].isGeneratingContent).toBeUndefined()
  })

  it('is a no-op when there are no messages', () => {
    seedConversation()
    useChatStore.getState().appendToLastMessage('c1', 'x')
    expect(useChatStore.getState().conversations.c1.messages).toEqual([])
  })

  it('is a no-op when the conversation does not exist', () => {
    expect(() => useChatStore.getState().appendToLastMessage('missing', 'x')).not.toThrow()
  })
})

describe('appendReasoningToLastMessage', () => {
  it('initializes reasoning when undefined and appends tokens', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: '' })
    useChatStore.getState().appendReasoningToLastMessage('c1', 'thinking ')
    useChatStore.getState().appendReasoningToLastMessage('c1', 'more')
    const msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].reasoning).toBe('thinking more')
  })
})

describe('finalizeLastMessage', () => {
  it('marks the last message as not streaming', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: 'x', isStreaming: true })
    useChatStore.getState().finalizeLastMessage('c1')
    expect(useChatStore.getState().conversations.c1.messages[0].isStreaming).toBe(false)
  })
})

describe('addToolCallToLastMessage / updateToolCallInLastMessage', () => {
  it('appends a new tool call', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: '' })
    useChatStore.getState().addToolCallToLastMessage('c1', {
      id: 'tc1',
      toolName: 'calc',
      args: {},
      status: 'calling',
    })
    expect(useChatStore.getState().conversations.c1.messages[0].toolCalls).toEqual([
      { id: 'tc1', toolName: 'calc', args: {}, status: 'calling' },
    ])
  })

  it('preserves startTime in tool calls (Phase 2)', () => {
    seedConversation()
    const startTime = Date.now()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: '' })
    useChatStore.getState().addToolCallToLastMessage('c1', {
      id: 'tc1',
      toolName: 'web-search',
      args: { query: 'test' },
      status: 'calling',
      startTime,
    })
    const toolCall = useChatStore.getState().conversations.c1.messages[0].toolCalls![0]
    expect(toolCall.startTime).toBe(startTime)
  })

  it('updates only the matching tool call', () => {
    seedConversation()
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: '' })
    useChatStore.getState().addToolCallToLastMessage('c1', {
      id: 'tc1', toolName: 'a', args: {}, status: 'calling',
    })
    useChatStore.getState().addToolCallToLastMessage('c1', {
      id: 'tc2', toolName: 'b', args: {}, status: 'calling',
    })
    useChatStore.getState().updateToolCallInLastMessage('c1', 'tc2', {
      status: 'complete', result: 42,
    })
    const tcs = useChatStore.getState().conversations.c1.messages[0].toolCalls!
    expect(tcs[0]).toMatchObject({ id: 'tc1', status: 'calling' })
    expect(tcs[1]).toMatchObject({ id: 'tc2', status: 'complete', result: 42 })
  })

  it('preserves startTime when updating tool call (Phase 2)', () => {
    seedConversation()
    const startTime = Date.now() - 5000
    useChatStore.getState().addMessage('c1', { role: 'assistant', content: '' })
    useChatStore.getState().addToolCallToLastMessage('c1', {
      id: 'tc1',
      toolName: 'deep_research',
      args: {},
      status: 'calling',
      startTime,
    })
    useChatStore.getState().updateToolCallInLastMessage('c1', 'tc1', {
      status: 'complete',
      result: { sources: [] },
    })
    const toolCall = useChatStore.getState().conversations.c1.messages[0].toolCalls![0]
    expect(toolCall.startTime).toBe(startTime)
    expect(toolCall.status).toBe('complete')
  })
})

describe('getConversationsForAgent', () => {
  it('returns conversations for agent sorted by updatedAt desc', () => {
    useChatStore.setState({
      conversations: {
        a: { id: 'a', agentId: 'agent-1', projectId: null, title: 'A', messages: [], createdAt: 1, updatedAt: 100 },
        b: { id: 'b', agentId: 'agent-1', projectId: null, title: 'B', messages: [], createdAt: 1, updatedAt: 300 },
        c: { id: 'c', agentId: 'agent-2', projectId: null, title: 'C', messages: [], createdAt: 1, updatedAt: 200 },
        d: { id: 'd', agentId: 'agent-1', projectId: null, title: 'D', messages: [], createdAt: 1, updatedAt: 200 },
      },
    })
    const result = useChatStore.getState().getConversationsForAgent('agent-1')
    expect(result.map((c) => c.id)).toEqual(['b', 'd', 'a'])
  })

  it('returns empty when agent has no conversations', () => {
    expect(useChatStore.getState().getConversationsForAgent('nope')).toEqual([])
  })
})

describe('setStreaming / setActiveConversation', () => {
  it('updates streaming flag', () => {
    useChatStore.getState().setStreaming(true)
    expect(useChatStore.getState().isStreaming).toBe(true)
    useChatStore.getState().setStreaming(false)
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('updates active conversation id', () => {
    useChatStore.getState().setActiveConversation('xyz')
    expect(useChatStore.getState().activeConversationId).toBe('xyz')
    useChatStore.getState().setActiveConversation(null)
    expect(useChatStore.getState().activeConversationId).toBeNull()
  })
})

describe('createConversation', () => {
  it('POSTs to the API and stores the returned id as the active conversation', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ id: 'srv-1' }) })

    const id = await useChatStore.getState().createConversation('agent-1', 'project-1')

    expect(id).toBe('srv-1')
    expect(useChatStore.getState().activeConversationId).toBe('srv-1')
    expect(useChatStore.getState().conversations['srv-1']).toMatchObject({
      id: 'srv-1',
      agentId: 'agent-1',
      projectId: 'project-1',
      title: 'New conversation',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/db/conversations', expect.objectContaining({
      method: 'POST',
    }))
  })
})

describe('deleteConversation', () => {
  it('removes the conversation and clears active if it was active', async () => {
    fetchMock.mockResolvedValueOnce({})
    seedConversation({ id: 'd1' })
    useChatStore.getState().setActiveConversation('d1')

    await useChatStore.getState().deleteConversation('d1')

    expect(useChatStore.getState().conversations).not.toHaveProperty('d1')
    expect(useChatStore.getState().activeConversationId).toBeNull()
  })

  it('preserves activeConversationId when deleting a different conversation', async () => {
    fetchMock.mockResolvedValueOnce({})
    seedConversation({ id: 'a' })
    seedConversation({ id: 'b' })
    useChatStore.getState().setActiveConversation('a')

    await useChatStore.getState().deleteConversation('b')

    expect(useChatStore.getState().activeConversationId).toBe('a')
  })
})

describe('updateConversationTitle', () => {
  it('PUTs to the server and updates the local title', async () => {
    fetchMock.mockResolvedValueOnce({})
    seedConversation({ id: 't1', title: 'old' })

    await useChatStore.getState().updateConversationTitle('t1', 'new title')

    expect(useChatStore.getState().conversations.t1.title).toBe('new title')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/db/conversations/t1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('is a no-op when conversation is missing', async () => {
    fetchMock.mockResolvedValueOnce({})
    await useChatStore.getState().updateConversationTitle('missing', 'x')
    expect(useChatStore.getState().conversations).toEqual({})
  })
})

describe('loadConversations / loadMessages', () => {
  it('loads conversations and marks loaded=true', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => [
        { id: '1', agentId: 'a', projectId: null, title: 'X', createdAt: 1, updatedAt: 1 },
        { id: '2', agentId: 'a', projectId: 'p', title: 'Y', createdAt: 2, updatedAt: 2 },
      ],
    })

    await useChatStore.getState().loadConversations()
    expect(useChatStore.getState().loaded).toBe(true)
    expect(useChatStore.getState().conversations['1']).toMatchObject({ id: '1', messages: [] })
    expect(useChatStore.getState().conversations['2'].projectId).toBe('p')
  })

  it('replaces messages for the targeted conversation', async () => {
    seedConversation({ id: 'm1' })
    fetchMock.mockResolvedValueOnce({
      json: async () => [
        { id: 'msg1', role: 'user', content: 'hi', createdAt: 1 },
      ],
    })

    await useChatStore.getState().loadMessages('m1')
    expect(useChatStore.getState().conversations.m1.messages).toEqual([
      { id: 'msg1', role: 'user', content: 'hi', createdAt: 1 },
    ])
  })

  it('loadMessages is a no-op when the conversation does not exist', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => [] })
    await useChatStore.getState().loadMessages('nope')
    expect(useChatStore.getState().conversations).toEqual({})
  })
})

describe('Phase 2 streaming workflow integration', () => {
  it('simulates thinking → generating transition', () => {
    seedConversation()

    // Add streaming assistant message with streamStartTime
    useChatStore.getState().addMessage('c1', {
      role: 'assistant',
      content: '',
      reasoning: '',
      isStreaming: true,
    })

    let msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].streamStartTime).toBeDefined()
    expect(msgs[0].isGeneratingContent).toBeUndefined()

    // Phase 1: Reasoning tokens (thinking state)
    useChatStore.getState().appendReasoningToLastMessage('c1', 'Let me analyze')
    useChatStore.getState().appendReasoningToLastMessage('c1', ' this problem...')

    msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].reasoning).toBe('Let me analyze this problem...')
    expect(msgs[0].content).toBe('')
    expect(msgs[0].isGeneratingContent).toBeUndefined() // Still thinking

    // Phase 2: Content starts (generating state)
    useChatStore.getState().appendToLastMessage('c1', 'The')
    msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].isGeneratingContent).toBe(true) // Now generating!

    useChatStore.getState().appendToLastMessage('c1', ' answer')
    useChatStore.getState().appendToLastMessage('c1', ' is...')

    msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].content).toBe('The answer is...')
    expect(msgs[0].isGeneratingContent).toBe(true)

    // Complete
    useChatStore.getState().finalizeLastMessage('c1')

    msgs = useChatStore.getState().conversations.c1.messages
    expect(msgs[0].isStreaming).toBe(false)
    expect(msgs[0].reasoning).toBe('Let me analyze this problem...')
    expect(msgs[0].content).toBe('The answer is...')
  })
})
