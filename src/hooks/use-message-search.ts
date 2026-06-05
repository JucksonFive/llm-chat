import { useMemo, useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type { Message } from '@/types'

export interface MessageSearchResult {
  message: Message
  conversationId: string
  conversationTitle: string
  messageIndex: number
}

interface SearchFilters {
  hasAttachments?: boolean
  hasTools?: boolean
  dateRange?: 'today' | 'week' | 'month' | 'all'
}

export function useMessageSearch(agentId?: string) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const conversations = useChatStore((s) => s.conversations)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return []

    const searchTerm = debouncedQuery.toLowerCase()
    const results: MessageSearchResult[] = []

    // Filter conversations by agent if specified
    const conversationsToSearch = Object.values(conversations).filter(
      (conv) => !agentId || conv.agentId === agentId
    )

    // Apply date range filter
    // eslint-disable-next-line react-hooks/purity -- intentionally computing current time for date filtering
    const now = Date.now()
    const dateThresholds: Record<string, number> = {
      today: now - 24 * 60 * 60 * 1000,
      week: now - 7 * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
      all: 0,
    }
    const dateThreshold = dateThresholds[filters.dateRange || 'all']

    for (const conv of conversationsToSearch) {
      // Skip if conversation is older than date filter
      if (conv.updatedAt < dateThreshold) continue

      conv.messages.forEach((msg, index) => {
        // Skip streaming messages
        if (msg.isStreaming) return

        // Apply filters
        if (filters.hasAttachments && !msg.attachments?.length) return
        if (filters.hasTools && !msg.toolCalls?.length) return

        // Search in content and reasoning
        const contentMatch = msg.content.toLowerCase().includes(searchTerm)
        const reasoningMatch = msg.reasoning?.toLowerCase().includes(searchTerm)

        if (contentMatch || reasoningMatch) {
          results.push({
            message: msg,
            conversationId: conv.id,
            conversationTitle: conv.title,
            messageIndex: index,
          })
        }
      })
    }

    // Sort by most recent first
    return results.sort((a, b) => b.message.createdAt - a.message.createdAt)
  }, [debouncedQuery, conversations, agentId, filters])

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    isSearching: query !== debouncedQuery,
  }
}

export function useConversationSearch(agentId?: string) {
  const [query, setQuery] = useState('')
  const conversations = useChatStore((s) => s.conversations)

  const filteredConversations = useMemo(() => {
    if (!query.trim()) {
      // Return all conversations for this agent
      return Object.values(conversations)
        .filter((conv) => !agentId || conv.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    }

    const searchTerm = query.toLowerCase()

    return Object.values(conversations)
      .filter((conv) => {
        if (agentId && conv.agentId !== agentId) return false

        // Search in title
        if (conv.title.toLowerCase().includes(searchTerm)) return true

        // Search in message content
        return conv.messages.some(
          (msg) =>
            msg.content.toLowerCase().includes(searchTerm) ||
            msg.reasoning?.toLowerCase().includes(searchTerm)
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [query, conversations, agentId])

  return {
    query,
    setQuery,
    filteredConversations,
    matchCount: filteredConversations.length,
  }
}
