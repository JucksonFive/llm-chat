import { useState } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStream } from '@/hooks/use-chat-stream'
import { useChatStore } from '@/stores/chat-store'
import { motion } from 'motion/react'

interface ErrorRetryButtonProps {
  conversationId: string
  errorMessage?: string
}

export function ErrorRetryButton({ conversationId, errorMessage }: ErrorRetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false)
  const { sendMessage } = useChatStream()

  const handleRetry = async () => {
    const conversation = useChatStore.getState().conversations[conversationId]
    if (!conversation) return

    // Find the last user message
    const messages = conversation.messages
    let lastUserMessage = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessage = messages[i]
        break
      }
    }

    if (!lastUserMessage) return

    setIsRetrying(true)
    try {
      // Remove the failed assistant message from local state
      useChatStore.setState((state) => {
        const conv = state.conversations[conversationId]
        if (!conv) return state
        const filtered = conv.messages.filter((m) => {
          // Keep all except the last assistant message if it has an error
          if (m === messages[messages.length - 1] && m.role === 'assistant') {
            return false
          }
          return true
        })
        return {
          conversations: {
            ...state.conversations,
            [conversationId]: { ...conv, messages: filtered },
          },
        }
      })

      // Resend the last user message
      await sendMessage(lastUserMessage.content, lastUserMessage.attachments)
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 flex items-center gap-2"
    >
      <Button
        size="sm"
        variant="outline"
        onClick={handleRetry}
        disabled={isRetrying}
        className="h-7 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <RefreshCw className={`h-3 w-3 ${isRetrying ? 'animate-spin' : ''}`} />
        {isRetrying ? 'Retrying...' : 'Try again'}
      </Button>
      {errorMessage && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          <span className="line-clamp-1">{errorMessage}</span>
        </div>
      )}
    </motion.div>
  )
}
