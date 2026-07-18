import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, Check, Database, FileText, FileIcon, FolderPlus, Lightbulb, Mic, MicOff, Paperclip, Plug, Plus, Settings2, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useMcpStore } from '@/stores/mcp-store'
import { useProjectStore } from '@/stores/project-store'
import { useChatStream } from '@/hooks/use-chat-stream'
import { ResourcesPanel } from '@/components/mcp/resources-panel'
import { PromptsPanel } from '@/components/mcp/prompts-panel'
import { WorkspaceMenu } from '@/components/chat/workspace-menu'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { SettingsSheet } from '@/components/settings/settings-sheet'
import { useUIStore } from '@/stores/ui-store'
import { toast } from 'sonner'
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
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [pluginSettingsOpen, setPluginSettingsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const agents = useAgentStore((s) => s.agents)
  const mcpStore = useMcpStore()
  const chatMode = useUIStore((s) => s.chatMode)
  const setChatMode = useUIStore((s) => s.setChatMode)
  const { sendMessage, abort } = useChatStream()

  const agent = agents.find((a) => a.id === activeAgentId)
  const hasMcpServers = (agent?.mcpServerIds ?? [])
    .map((id) => mcpStore.getServer(id))
    .filter((s): s is McpServerConfig => s !== undefined)
    .length > 0

  const togglePlugin = async (serverId: string, enabled: boolean) => {
    if (!agent) return
    const nextServerIds = enabled
      ? Array.from(new Set([...(agent.mcpServerIds ?? []), serverId]))
      : (agent.mcpServerIds ?? []).filter((id) => id !== serverId)

    try {
      await updateAgent(agent.id, { mcpServerIds: nextServerIds })
    } catch {
      toast.error('Failed to update plugins')
    }
  }

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
          'relative shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-4 pt-2',
          isDragging && 'bg-primary/5',
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/40 bg-background/90 backdrop-blur-sm">
            <div className="text-sm font-medium text-primary">
              Drop files here (images, PDFs)
            </div>
          </div>
        )}
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-[26px] border border-border/70 bg-background/95 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.24)] backdrop-blur-xl dark:bg-card/95">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) processFiles(event.target.files)
                event.target.value = ''
              }}
            />

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="group relative flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-2.5 py-2 text-xs"
                  >
                    {att.type === 'image' ? (
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <FileIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="max-w-[140px] truncate text-muted-foreground">
                      {att.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Remove ${att.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={(event) => {
                const files = event.clipboardData.files
                if (files.length > 0) {
                  event.preventDefault()
                  processFiles(files)
                }
              }}
              placeholder="Message LLM Chat"
              className={cn(
                'min-h-[54px] max-h-[200px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3 text-[15px] shadow-none',
                'focus-visible:ring-0 focus-visible:ring-offset-0',
              )}
              rows={1}
            />

            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
              <div className="flex min-w-0 items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-full border-border/70 bg-transparent"
                      aria-label="Add files and tools"
                      title="Add files and tools"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-72">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Add</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-4 w-4" />
                      <div>
                        <p>Files</p>
                        <p className="text-[11px] text-muted-foreground">Attach images or PDFs</p>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setWorkspaceDialogOpen(true)}>
                      <FolderPlus className="h-4 w-4" />
                      <div>
                        <p>Workspace folder</p>
                        <p className="text-[11px] text-muted-foreground">
                          {activeProjectId ? 'Edit the active project path' : 'Add a local project path'}
                        </p>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setChatMode(chatMode === 'plan' ? 'chat' : 'plan')}>
                      <Lightbulb className='h-4 w-4' />
                      <div className='min-w-0 flex-1'>
                        <p>Plan mode</p>
                        <p className='text-[11px] text-muted-foreground'>
                          {chatMode === 'plan' ? 'Turn plan mode off' : 'Plan before making changes'}
                        </p>
                      </div>
                      {chatMode === 'plan' && <Check className='h-4 w-4 text-primary' />}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className='text-xs text-muted-foreground'>Plugins</DropdownMenuLabel>
                    {mcpStore.servers.length === 0 ? (
                      <DropdownMenuItem onSelect={() => setPluginSettingsOpen(true)}>
                        <Plug className='h-4 w-4' />
                        <div>
                          <p>Connect plugins</p>
                          <p className='text-[11px] text-muted-foreground'>Add an MCP integration</p>
                        </div>
                      </DropdownMenuItem>
                    ) : (
                      mcpStore.servers.map((server) => (
                        <DropdownMenuCheckboxItem
                          key={server.id}
                          checked={agent?.mcpServerIds?.includes(server.id) ?? false}
                          onSelect={(event) => event.preventDefault()}
                          onCheckedChange={(checked) => {
                            void togglePlugin(server.id, checked === true)
                          }}
                          className='items-start py-2'
                        >
                          <Plug className='mt-0.5 h-4 w-4' />
                          <div className='min-w-0'>
                            <p className='truncate'>{server.name}</p>
                            <p className='text-[11px] text-muted-foreground'>MCP integration</p>
                          </div>
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                    <DropdownMenuItem onSelect={() => setPluginSettingsOpen(true)}>
                      <Settings2 className='h-4 w-4' />
                      <div>
                        <p>Manage plugins</p>
                        <p className='text-[11px] text-muted-foreground'>Connect and configure MCP servers</p>
                      </div>
                    </DropdownMenuItem>
                    {hasMcpServers && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setResourcesOpen(true)}>
                          <Database className="h-4 w-4" />
                          <div>
                            <p>Resources</p>
                            <p className="text-[11px] text-muted-foreground">Browse connected MCP resources</p>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPromptsOpen(true)}>
                          <FileText className="h-4 w-4" />
                          <div>
                            <p>Prompts</p>
                            <p className="text-[11px] text-muted-foreground">Use a prompt from an MCP server</p>
                          </div>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <WorkspaceMenu />
                {chatMode === 'plan' && (
                  <Button
                    variant='secondary'
                    size='sm'
                    className='h-7 gap-1.5 rounded-full px-2.5 text-xs text-amber-700 dark:text-amber-300'
                    onClick={() => setChatMode('chat')}
                    aria-label='Turn plan mode off'
                  >
                    <Lightbulb className='h-3.5 w-3.5' />
                    Plan
                    <X className='h-3 w-3 opacity-60' />
                  </Button>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {hasSpeechRecognition && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant={isListening ? 'destructive' : 'ghost'}
                        className={cn(
                          'h-8 w-8 rounded-full',
                          isListening && 'animate-pulse',
                        )}
                        onClick={toggleListening}
                      >
                        {isListening ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isListening ? 'Stop recording' : 'Voice input'}</TooltipContent>
                  </Tooltip>
                )}
                <Button
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={isStreaming ? abort : handleSend}
                  disabled={!isStreaming && (!input.trim() && attachments.length === 0)}
                  aria-label={isStreaming ? 'Stop generating' : 'Send message'}
                >
                  {isStreaming ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
            LLMs can make mistakes. Check important information.
          </p>
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
      <ProjectDialog
        open={workspaceDialogOpen}
        onOpenChange={setWorkspaceDialogOpen}
        editProjectId={activeProjectId}
      />
      <SettingsSheet
        open={pluginSettingsOpen}
        onOpenChange={setPluginSettingsOpen}
        initialTab='mcp'
      />
    </>
  )
}
