import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Pencil, Trash2, Server, Package, Upload, Link as LinkIcon, ChevronDown } from 'lucide-react'
import { useMcpStore } from '@/stores/mcp-store'
import { McpServerDialog } from '@/components/settings/mcp-server-dialog'
import { McpPresetsDialog } from '@/components/settings/mcp-presets-dialog'

export function McpServersSection() {
  const servers = useMcpStore((s) => s.servers)
  const deleteServer = useMcpStore((s) => s.deleteServer)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [presetsTab, setPresetsTab] = useState<'browse' | 'file' | 'url'>('browse')
  const [editingServerId, setEditingServerId] = useState<string | null>(null)

  const handleAdd = () => {
    setEditingServerId(null)
    setDialogOpen(true)
  }

  const handleEdit = (id: string) => {
    setEditingServerId(id)
    setDialogOpen(true)
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">MCP Servers</h3>
          </div>
          <div className="flex gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <Package className="h-3.5 w-3.5 mr-1" />
                  Import
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setPresetsTab('browse'); setPresetsOpen(true); }}>
                  <Package className="h-3.5 w-3.5 mr-2" />
                  Browse Presets
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setPresetsTab('file'); setPresetsOpen(true); }}>
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Import from File
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setPresetsTab('url'); setPresetsOpen(true); }}>
                  <LinkIcon className="h-3.5 w-3.5 mr-2" />
                  Import from URL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Connect MCP servers to give agents access to external tools.
        </p>

        {servers.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No MCP servers configured.
          </p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{server.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {server.transport}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                    {server.transport === 'stdio'
                      ? `${server.command} ${server.args?.join(' ') ?? ''}`
                      : server.url}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleEdit(server.id)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteServer(server.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <McpServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editServerId={editingServerId}
      />
      <McpPresetsDialog
        open={presetsOpen}
        onOpenChange={setPresetsOpen}
        defaultTab={presetsTab}
      />
    </>
  )
}
