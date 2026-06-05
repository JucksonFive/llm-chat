import { useState, useEffect, useCallback } from 'react'
import { Search, Calendar, Paperclip, Wrench, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMessageSearch } from '@/hooks/use-message-search'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { cn } from '@/lib/utils'

interface MessageSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString()
}

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark class="bg-primary/20 text-foreground">$1</mark>')
}

export function MessageSearchDialog({ open, onOpenChange }: MessageSearchDialogProps) {
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const getConversationsForAgent = useChatStore((s) => s.getConversationsForAgent)
  const { query, setQuery, filters, setFilters, results, isSearching } = useMessageSearch(activeAgentId || undefined)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const loadMessages = useChatStore((s) => s.loadMessages)

  // Load messages for all conversations when dialog opens
  useEffect(() => {
    if (!open || !activeAgentId) return

    const agentConversations = getConversationsForAgent(activeAgentId)
    const conversationsNeedingMessages = agentConversations.filter((conv) => conv.messages.length === 0)

    if (conversationsNeedingMessages.length === 0) return

    let cancelled = false

    // Load messages for all conversations in parallel
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading state
    setIsLoadingMessages(true)

    Promise.all(
      conversationsNeedingMessages.map((conv) =>
        loadMessages(conv.id).catch((err) => {
          console.warn(`Failed to load messages for conversation ${conv.id}:`, err)
        })
      )
    ).finally(() => {
      if (!cancelled) {
        setIsLoadingMessages(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, activeAgentId, getConversationsForAgent, loadMessages])

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('')
      setFilters({})
    }
  }, [open, setQuery, setFilters])

  // Handle Escape key to close dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  const handleResultClick = useCallback(async (conversationId: string, messageIndex: number) => {
    // Switch to the conversation
    setActiveConversation(conversationId)

    // Load messages if needed
    const conv = useChatStore.getState().conversations[conversationId]
    if (conv.messages.length === 0) {
      await loadMessages(conversationId)
    }

    // Close dialog
    onOpenChange(false)

    // Scroll to message (after a small delay to ensure DOM is ready)
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-index="${messageIndex}"]`)
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Highlight briefly
        messageElement.classList.add('ring-2', 'ring-primary', 'rounded')
        setTimeout(() => {
          messageElement.classList.remove('ring-2', 'ring-primary', 'rounded')
        }, 2000)
      }
    }, 100)
  }, [setActiveConversation, loadMessages, onOpenChange])

  const toggleFilter = useCallback((filter: keyof typeof filters, value?: 'today' | 'week' | 'month' | 'all') => {
    setFilters((prev) => {
      const current = prev[filter]
      if (filter === 'dateRange') {
        return { ...prev, dateRange: current === value ? undefined : value }
      }
      return { ...prev, [filter]: !current }
    })
  }, [setFilters])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            Search Messages
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 pb-3 border-b space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in messages..."
              className="pl-9 pr-4"
              autoFocus
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Filters:</span>

            <Button
              variant={filters.hasAttachments ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => toggleFilter('hasAttachments')}
            >
              <Paperclip className="h-3 w-3 mr-1" />
              Has attachments
            </Button>

            <Button
              variant={filters.hasTools ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => toggleFilter('hasTools')}
            >
              <Wrench className="h-3 w-3 mr-1" />
              With tools
            </Button>

            <Button
              variant={filters.dateRange === 'today' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => toggleFilter('dateRange', 'today')}
            >
              <Calendar className="h-3 w-3 mr-1" />
              Today
            </Button>

            <Button
              variant={filters.dateRange === 'week' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => toggleFilter('dateRange', 'week')}
            >
              <Calendar className="h-3 w-3 mr-1" />
              This week
            </Button>

            {(filters.hasAttachments || filters.hasTools || filters.dateRange) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilters({})}
              >
                <X className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoadingMessages ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p>Loading messages...</p>
              <p className="text-xs mt-1">This may take a moment for large conversations</p>
            </div>
          ) : !query.trim() ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Type to search messages</p>
              <p className="text-xs mt-1">Press Cmd+K to open anytime</p>
            </div>
          ) : isSearching ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p>Searching...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No messages found</p>
              <p className="text-xs mt-1">Try different keywords or filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground mb-3">
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </div>
              {results.map((result, index) => {
                const preview = result.message.content.slice(0, 150)
                const hasMore = result.message.content.length > 150

                return (
                  <button
                    key={`${result.conversationId}-${result.messageIndex}-${index}`}
                    onClick={() => handleResultClick(result.conversationId, result.messageIndex)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border border-border/50',
                      'hover:bg-muted/40 transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-primary'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {result.conversationTitle}
                        </span>
                        {result.message.attachments && result.message.attachments.length > 0 && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            <Paperclip className="h-2.5 w-2.5 mr-0.5" />
                            {result.message.attachments.length}
                          </Badge>
                        )}
                        {result.message.toolCalls && result.message.toolCalls.length > 0 && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            <Wrench className="h-2.5 w-2.5 mr-0.5" />
                            {result.message.toolCalls.length}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(result.message.createdAt)}
                      </span>
                    </div>
                    <div
                      className="text-sm text-muted-foreground line-clamp-2"
                      dangerouslySetInnerHTML={{
                        __html: highlightMatch(preview + (hasMore ? '...' : ''), query),
                      }}
                    />
                    <div className="mt-1 text-xs text-muted-foreground capitalize">
                      {result.message.role}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
