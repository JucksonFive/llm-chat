import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Database, FileText, X, FileIcon, Mic, MicOff } from 'lucide-react'
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
import { apiFetch } from '@/lib/api-fetch'
import type { McpServerConfig, Attachment } from '@/types'

export function MessageInput() {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [promptsOpen, setPromptsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragCounterRef = useRef(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
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

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const newAttachments: Attachment[] = []
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      if (!isImage && !isPdf) continue

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      const attachment: Attachment = {
        id: crypto.randomUUID(),
        type: isImage ? 'image' : 'pdf',
        name: file.name,
        dataUrl,
      }

      if (isPdf) {
        try {
          const res = await apiFetch('/api/extract-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl }),
          })
          const data = await res.json()
          attachment.textContent = data.text
        } catch {
          attachment.textContent = '[PDF text extraction failed]'
        }
      }

      newAttachments.push(attachment)
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }, [processFiles])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || !activeAgentId) return
    setInput('')
    sendMessage(text || '(attached files)', attachments.length > 0 ? attachments : undefined)
    setAttachments([])
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

  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = '' // auto-detect language

    let finalTranscript = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      setInput((prev) => {
        // Remove previous interim result and add the new one
        const base = prev.replace(/\u200B.*$/, '')
        const current = finalTranscript + (interim ? '\u200B' + interim : '')
        return base ? base + ' ' + current : current
      })
    }

    recognition.onend = () => {
      setIsListening(false)
      // Clean up zero-width space markers from interim results
      setInput((prev) => prev.replace(/\u200B/g, ''))
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

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
      <div
        className={cn(
          'border-t border-border/50 bg-background/80 backdrop-blur-xl p-4 relative',
          isDragging && 'ring-2 ring-primary/50 ring-inset bg-primary/5',
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5 backdrop-blur-sm z-10 rounded-lg border-2 border-dashed border-primary/30 pointer-events-none">
            <div className="text-sm font-medium text-primary">
              Drop files here (images, PDFs)
            </div>
          </div>
        )}
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

          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs"
                >
                  {att.type === 'image' ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <FileIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="max-w-[120px] truncate text-muted-foreground">
                    {att.name}
                  </span>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1.5 -right-1.5 h-6 w-6 sm:h-5 sm:w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative flex flex-col sm:flex-row items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={(e) => {
                const files = e.clipboardData.files
                if (files.length > 0) {
                  e.preventDefault()
                  processFiles(files)
                }
              }}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              className={cn(
                'min-h-[44px] max-h-[200px] resize-none w-full',
                'sm:pr-12', // Only add padding on desktop
                'transition-shadow duration-200',
                'focus-visible:ring-primary/50 focus-visible:shadow-[0_0_15px_rgba(59,130,246,0.15)]',
              )}
              rows={1}
            />
            <div className="flex gap-2 w-full sm:w-auto">
              {hasSpeechRecognition && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={isListening ? 'destructive' : 'ghost'}
                      className={cn(
                        'h-12 w-12 sm:h-[44px] sm:w-[44px] shrink-0',
                        isListening && 'animate-pulse',
                      )}
                      onClick={toggleListening}
                    >
                      {isListening ? (
                        <MicOff className="h-5 w-5 sm:h-4 sm:w-4" />
                      ) : (
                        <Mic className="h-5 w-5 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isListening ? 'Stop recording' : 'Voice input'}</TooltipContent>
                </Tooltip>
              )}
              <Button
                size="icon"
                className="h-12 w-12 sm:h-[44px] sm:w-[44px] shrink-0 flex-1 sm:flex-none"
                onClick={isStreaming ? abort : handleSend}
                disabled={!isStreaming && (!input.trim() && attachments.length === 0)}
              >
                {isStreaming ? (
                  <Square className="h-5 w-5 sm:h-4 sm:w-4" />
                ) : (
                  <Send className="h-5 w-5 sm:h-4 sm:w-4" />
                )}
              </Button>
            </div>
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
