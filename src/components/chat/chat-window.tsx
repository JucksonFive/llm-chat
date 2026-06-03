import { MessageBubble } from '@/components/chat/message-bubble'
import { Button } from '@/components/ui/button'
import { useAutoScroll } from '@/hooks/use-auto-scroll'
import { useAgentStore } from '@/stores/agent-store'
import type { Conversation } from '@/types'
import { ArrowDown, ChevronUp } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useState, useMemo } from 'react'

interface ChatWindowProps {
  conversation: Conversation
}

const INITIAL_VISIBLE_COUNT = 50
const LOAD_MORE_INCREMENT = 50

export function ChatWindow({ conversation }: ChatWindowProps) {
  const agents = useAgentStore((s) => s.agents)
  const agent = agents.find((a) => a.id === conversation.agentId)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)

  const { scrollRef, isAtBottom, scrollToBottom, handleScroll } = useAutoScroll([
    conversation.messages,
  ])

  // Show only the most recent messages for performance.
  // For long conversations, user can click "Load earlier messages" to load more.
  const totalMessages = conversation.messages.length
  const hiddenCount = Math.max(0, totalMessages - visibleCount)
  const visibleMessages = useMemo(() => {
    if (totalMessages <= visibleCount) return conversation.messages
    return conversation.messages.slice(-visibleCount)
  }, [conversation.messages, visibleCount, totalMessages])

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + LOAD_MORE_INCREMENT)
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto py-4"
      >
        {hiddenCount > 0 && (
          <div className="flex justify-center mb-4 px-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              className="text-xs gap-1.5 h-7"
            >
              <ChevronUp className="h-3 w-3" />
              Load earlier messages ({hiddenCount} hidden)
            </Button>
          </div>
        )}
        <AnimatePresence>
          {visibleMessages.map((message, index) => {
            // Calculate the original index in the full message list
            const originalIndex = totalMessages - visibleMessages.length + index
            return (
              <div key={message.id} data-message-index={originalIndex}>
                <MessageBubble
                  message={message}
                  agentName={agent?.name}
                  agentColor={agent?.avatarColor}
                />
              </div>
            )
          })}
        </AnimatePresence>
      </div>

      {!isAtBottom && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-4 right-4 h-8 w-8 rounded-full shadow-lg bg-background/80 backdrop-blur-sm"
          onClick={scrollToBottom}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
