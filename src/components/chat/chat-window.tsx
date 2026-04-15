import { MessageBubble } from '@/components/chat/message-bubble'
import { Button } from '@/components/ui/button'
import { useAutoScroll } from '@/hooks/use-auto-scroll'
import { useAgentStore } from '@/stores/agent-store'
import type { Conversation } from '@/types'
import { ArrowDown } from 'lucide-react'
import { AnimatePresence } from 'motion/react'

interface ChatWindowProps {
  conversation: Conversation
}

export function ChatWindow({ conversation }: ChatWindowProps) {
  const agents = useAgentStore((s) => s.agents)
  const agent = agents.find((a) => a.id === conversation.agentId)

  const { scrollRef, isAtBottom, scrollToBottom, handleScroll } = useAutoScroll([
    conversation.messages,
  ])

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto py-4"
      >
        <AnimatePresence>
          {conversation.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              agentName={agent?.name}
              agentColor={agent?.avatarColor}
            />
          ))}
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
