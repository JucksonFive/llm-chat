import { useState, useRef, useEffect } from 'react'
import { Send, Square, Database, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useMcpStore } from '@/stores/mcp-store'
import { useChatStream } from '@/hooks/use-chat-stream'
import { ResourcesPanel } from '@/components/mcp/resources-panel'
import { PromptsPanel } from '@/components/mcp/prompts-panel'
import { cn } from '@/lib/utils'
import type { McpServerConfig } from '@/types'

export function MessageInput() {
  const [input, setInput] = useState('')
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [promptsOpen, setPromptsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const mcpStore = useMcpStore()
  const { sendMessage, abort } = useChatStream()

  const agent = agents.find((a) => a.id === activeAgentId)
  const hasMcpServers = (agent?.mcpServerIds ?? [])
    .map((id) => mcpStore.getServer(id))
    .filter((s): s is McpServerConfig => s !== undefined)
    .length > 0

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

  const handleInsertResource = (content: string) => {
    setInput((prev) => (prev ? prev + '\n\n' + content : content))
    textareaRef.current?.focus()
  }

  const handleUsePrompt = (messages: { role: string; content: string }[]) => {
    // Insert the prompt content as the user's message
    const userMessages = messages.filter((m) => m.role === 'user')
    const assistantMessages = messages.filter((m) => m.role === 'assistant')
    if (userMessages.length > 0) {
      setInput(userMessages.map((m) => m.content).join('\n\n'))
    } else if (assistantMessages.length > 0) {
      setInput(assistantMessages.map((m) => m.content).join('\n\n'))
    } else if (messages.length > 0) {
      setInput(messages.map((m) => m.content).join('\n\n'))
    }
    textareaRef.current?.focus()
  }

  return (
    <>
      <div className="border-t border-border/50 bg-background/80 backdrop-blur-xl p-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {hasMcpServers && (
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setResourcesOpen(true)}
                  >
                    <Database className="h-3.5 w-3.5 mr-1" />
                    Resources
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Browse MCP resources</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setPromptsOpen(true)}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Prompts
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Browse MCP prompts</TooltipContent>
              </Tooltip>
            </div>
          )}
          <div className="relative flex items-end gap-2">
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
      </div>

      <ResourcesPanel
        open={resourcesOpen}
        onOpenChange={setResourcesOpen}
        onInsert={handleInsertResource}
      />
      <PromptsPanel
        open={promptsOpen}
        onOpenChange={setPromptsOpen}
        onUsePrompt={handleUsePrompt}
      />
    </>
  )
}
