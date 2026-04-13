import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Database, ChevronDown, ChevronRight, Copy, Loader2 } from 'lucide-react'
import { useAgentStore } from '@/stores/agent-store'
import { useMcpStore } from '@/stores/mcp-store'
import { toast } from 'sonner'
import type { McpResource, McpServerConfig } from '@/types'

interface ResourcesPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (content: string) => void
}

export function ResourcesPanel({ open, onOpenChange, onInsert }: ResourcesPanelProps) {
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const mcpStore = useMcpStore()

  const [resources, setResources] = useState<McpResource[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedUri, setExpandedUri] = useState<string | null>(null)
  const [resourceContent, setResourceContent] = useState<Record<string, string>>({})
  const [loadingContent, setLoadingContent] = useState<string | null>(null)

  const agent = agents.find((a) => a.id === activeAgentId)
  const mcpServers = (agent?.mcpServerIds ?? [])
    .map((id) => mcpStore.getServer(id))
    .filter((s): s is McpServerConfig => s !== undefined)

  useEffect(() => {
    if (open && mcpServers.length > 0) {
      loadResources()
    }
    if (!open) {
      setExpandedUri(null)
    }
  }, [open])

  const loadResources = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mcp/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: mcpServers }),
      })
      const data = await res.json()
      setResources(data.resources ?? [])
    } catch {
      toast.error('Failed to load resources')
    } finally {
      setLoading(false)
    }
  }

  const loadContent = async (serverId: string, uri: string) => {
    if (resourceContent[uri]) return
    setLoadingContent(uri)
    try {
      const res = await fetch('/api/mcp/resources/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, uri }),
      })
      const data = await res.json()
      const contents = data.contents ?? []
      const text = contents
        .map((c: { text?: string }) => c.text ?? '')
        .filter(Boolean)
        .join('\n')
      setResourceContent((prev) => ({ ...prev, [uri]: text }))
    } catch {
      toast.error('Failed to read resource')
    } finally {
      setLoadingContent(null)
    }
  }

  const handleToggle = (resource: McpResource) => {
    if (expandedUri === resource.uri) {
      setExpandedUri(null)
    } else {
      setExpandedUri(resource.uri)
      loadContent(resource.serverId, resource.uri)
    }
  }

  const handleInsert = (uri: string) => {
    const content = resourceContent[uri]
    if (content) {
      onInsert(`[Resource: ${uri}]\n${content}`)
      onOpenChange(false)
    }
  }

  const grouped = resources.reduce<Record<string, McpResource[]>>((acc, r) => {
    const key = r.serverName
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-400" />
            Resources
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Browse resources from connected MCP servers. Click to preview, then insert into your message.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : mcpServers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No MCP servers configured for this agent.
            </p>
          ) : resources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No resources available from connected servers.
            </p>
          ) : (
            <ScrollArea className="h-[calc(100vh-250px)]">
              <div className="space-y-4">
                {Object.entries(grouped).map(([serverName, serverResources]) => (
                  <div key={serverName}>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">{serverName}</h4>
                    <div className="space-y-1">
                      {serverResources.map((resource) => (
                        <div key={resource.uri} className="rounded-lg border border-border/50 bg-muted/30">
                          <button
                            className="flex items-center gap-2 w-full p-2.5 text-left hover:bg-muted/50 rounded-lg transition-colors"
                            onClick={() => handleToggle(resource)}
                          >
                            {expandedUri === resource.uri ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">{resource.name || resource.uri}</span>
                              <span className="text-[10px] text-muted-foreground font-mono truncate block">{resource.uri}</span>
                            </div>
                            {resource.mimeType && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {resource.mimeType}
                              </Badge>
                            )}
                          </button>
                          {expandedUri === resource.uri && (
                            <div className="px-2.5 pb-2.5 space-y-2">
                              {loadingContent === resource.uri ? (
                                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Loading content...
                                </div>
                              ) : resourceContent[resource.uri] ? (
                                <>
                                  <pre className="text-xs bg-background/80 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                                    {resourceContent[resource.uri].slice(0, 2000)}
                                    {resourceContent[resource.uri].length > 2000 && '\n\n[Preview truncated]'}
                                  </pre>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={() => handleInsert(resource.uri)}
                                    >
                                      <Copy className="h-3 w-3 mr-1" />
                                      Insert into message
                                    </Button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ))}
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
