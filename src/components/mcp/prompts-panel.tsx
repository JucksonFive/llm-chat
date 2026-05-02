import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { useAgentStore } from '@/stores/agent-store'
import { useMcpStore } from '@/stores/mcp-store'
import type { McpPrompt, McpServerConfig } from '@/types'
import { ChevronDown, ChevronRight, FileText, Loader2, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface PromptsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUsePrompt: (messages: { role: string; content: string }[]) => void
}

export function PromptsPanel({ open, onOpenChange, onUsePrompt }: PromptsPanelProps) {
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const mcpStore = useMcpStore()

  const [prompts, setPrompts] = useState<McpPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)
  const [argValues, setArgValues] = useState<Record<string, string>>({})
  const [resolving, setResolving] = useState(false)

  const agent = agents.find((a) => a.id === activeAgentId)
  const mcpServers = (agent?.mcpServerIds ?? [])
    .map((id) => mcpStore.getServer(id))
    .filter((s): s is McpServerConfig => s !== undefined)

  useEffect(() => {
    if (open && mcpServers.length > 0) {
      loadPrompts()
    }
    if (!open) {
      setExpandedPrompt(null)
      setArgValues({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const loadPrompts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mcp/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: mcpServers }),
      })
      const data = await res.json()
      setPrompts(data.prompts ?? [])
    } catch {
      toast.error('Failed to load prompts')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (prompt: McpPrompt) => {
    const key = `${prompt.serverId}:${prompt.name}`
    if (expandedPrompt === key) {
      setExpandedPrompt(null)
    } else {
      setExpandedPrompt(key)
      setArgValues({})
    }
  }

  const handleUsePrompt = async (prompt: McpPrompt) => {
    setResolving(true)
    try {
      const args: Record<string, string> = {}
      for (const arg of prompt.arguments ?? []) {
        if (argValues[arg.name]) {
          args[arg.name] = argValues[arg.name]
        }
      }

      const res = await fetch('/api/mcp/prompts/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: prompt.serverId,
          name: prompt.name,
          arguments: Object.keys(args).length > 0 ? args : undefined,
        }),
      })
      const data = await res.json()

      if (data.messages && data.messages.length > 0) {
        const messages = data.messages.map((m: { role: string; content: unknown }) => ({
          role: m.role,
          content: typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? m.content
                  .filter((c: { type: string }) => c.type === 'text')
                  .map((c: { text: string }) => c.text)
                  .join('\n')
              : String(m.content),
        }))
        onUsePrompt(messages)
        onOpenChange(false)
        toast.success('Prompt applied')
      }
    } catch {
      toast.error('Failed to resolve prompt')
    } finally {
      setResolving(false)
    }
  }

  const grouped = prompts.reduce<Record<string, McpPrompt[]>>((acc, p) => {
    const key = p.serverName
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-400" />
            Prompts
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Use prompt templates from MCP servers. Fill in arguments and apply to your conversation.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : mcpServers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No MCP servers configured for this agent.
            </p>
          ) : prompts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No prompts available from connected servers.
            </p>
          ) : (
            <ScrollArea className="h-[calc(100vh-250px)]">
              <div className="space-y-4">
                {Object.entries(grouped).map(([serverName, serverPrompts]) => (
                  <div key={serverName}>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">{serverName}</h4>
                    <div className="space-y-1">
                      {serverPrompts.map((prompt) => {
                        const key = `${prompt.serverId}:${prompt.name}`
                        const isExpanded = expandedPrompt === key
                        return (
                          <div key={key} className="rounded-lg border border-border/50 bg-muted/30">
                            <button
                              className="flex items-center gap-2 w-full p-2.5 text-left hover:bg-muted/50 rounded-lg transition-colors"
                              onClick={() => handleToggle(prompt)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium truncate block">{prompt.name}</span>
                                {prompt.description && (
                                  <span className="text-[10px] text-muted-foreground truncate block">{prompt.description}</span>
                                )}
                              </div>
                              {prompt.arguments && prompt.arguments.length > 0 && (
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {prompt.arguments.length} arg{prompt.arguments.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </button>
                            {isExpanded && (
                              <div className="px-2.5 pb-2.5 space-y-3">
                                {prompt.arguments && prompt.arguments.length > 0 && (
                                  <div className="space-y-2">
                                    {prompt.arguments.map((arg) => (
                                      <div key={arg.name} className="space-y-1">
                                        <Label className="text-xs">
                                          {arg.name}
                                          {arg.required && <span className="text-red-400 ml-0.5">*</span>}
                                        </Label>
                                        {arg.description && (
                                          <p className="text-[10px] text-muted-foreground">{arg.description}</p>
                                        )}
                                        <Input
                                          value={argValues[arg.name] ?? ''}
                                          onChange={(e) =>
                                            setArgValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
                                          }
                                          placeholder={arg.description || arg.name}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => handleUsePrompt(prompt)}
                                  disabled={resolving}
                                >
                                  {resolving ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3 mr-1" />
                                  )}
                                  Use Prompt
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
