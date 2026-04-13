import { useState, useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStream } from '@/hooks/use-chat-stream'
import { cn } from '@/lib/utils'

export function MessageInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const { sendMessage, abort } = useChatStream()

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text || !activeAgentId) return
    setInput('')
    sendMessage(text)
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming) {
        handleSend()
      }
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur-xl p-4">
      <div className="relative flex items-end gap-2 max-w-3xl mx-auto">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          className={cn(
            'min-h-[44px] max-h-[200px] resize-none pr-12',
            'transition-shadow duration-200',
            'focus-visible:ring-primary/50 focus-visible:shadow-[0_0_15px_rgba(59,130,246,0.15)]',
          )}
          rows={1}
        />
        <Button
          size="icon"
          className="h-[44px] w-[44px] shrink-0"
          onClick={isStreaming ? abort : handleSend}
          disabled={!isStreaming && !input.trim()}
        >
          {isStreaming ? (
            <Square className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
