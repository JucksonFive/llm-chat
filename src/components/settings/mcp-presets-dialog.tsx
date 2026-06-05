import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Check, Download, Loader2 } from 'lucide-react'
import { useMcpStore } from '@/stores/mcp-store'
import { toast } from 'sonner'
import { FileImportTab, UrlImportTab } from './mcp-import-tabs'
import type { McpPreset } from '@/types'

interface McpPresetsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: 'browse' | 'file' | 'url'
}

const CATEGORY_COLORS: Record<string, string> = {
  filesystem: 'text-green-400 border-green-400/30',
  search: 'text-blue-400 border-blue-400/30',
  database: 'text-purple-400 border-purple-400/30',
  developer: 'text-orange-400 border-orange-400/30',
  productivity: 'text-cyan-400 border-cyan-400/30',
  diagrams: 'text-pink-400 border-pink-400/30',
  drawing: 'text-yellow-400 border-yellow-400/30',
  visualization: 'text-indigo-400 border-indigo-400/30',
  'ai-tools': 'text-violet-400 border-violet-400/30',
  communication: 'text-teal-400 border-teal-400/30',
}

export function McpPresetsDialog({ open, onOpenChange, defaultTab = 'browse' }: McpPresetsDialogProps) {
  const { servers, addServer } = useMcpStore()
  const [presets, setPresets] = useState<McpPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [envInputs, setEnvInputs] = useState<Record<string, Record<string, string>>>({})

  const installedPresetIds = servers
    .filter((s) => s.presetId)
    .map((s) => s.presetId)

  useEffect(() => {
    if (open) {
      loadPresets()
    }
  }, [open])

  const loadPresets = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mcp/presets')
      const data = await res.json()
      setPresets(data.presets ?? [])
    } catch {
      toast.error('Failed to load presets')
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = (preset: McpPreset) => {
    const envValues = envInputs[preset.id] ?? {}

    // Check required env vars
    const missing = (preset.envPlaceholders ?? [])
      .filter((p) => p.required && !envValues[p.key]?.trim())
    if (missing.length > 0) {
      toast.error(`Missing required: ${missing.map((m) => m.label).join(', ')}`)
      return
    }

    // Build env from placeholders
    const env: Record<string, string> = { ...(preset.env ?? {}) }
    for (const [key, value] of Object.entries(envValues)) {
      if (value.trim()) {
        env[key] = value.trim()
      }
    }

    addServer({
      name: preset.name,
      transport: preset.transport,
      command: preset.command,
      args: preset.args,
      env: Object.keys(env).length > 0 ? env : undefined,
      url: preset.url,
      presetId: preset.id,
    })

    toast.success(`${preset.name} installed`)
    setInstallingId(null)
  }

  const grouped = presets.reduce<Record<string, McpPreset[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {})

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>MCP Servers</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="browse">Browse Presets</TabsTrigger>
            <TabsTrigger value="file">Import File</TabsTrigger>
            <TabsTrigger value="url">Import URL</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="flex-1 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-5 pb-4">
                  {Object.entries(grouped).map(([category, categoryPresets]) => (
                <div key={category}>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    {category}
                  </h4>
                  <div className="space-y-2">
                    {categoryPresets.map((preset) => {
                      const isInstalled = installedPresetIds.includes(preset.id)
                      const isConfiguring = installingId === preset.id
                      const hasEnvPlaceholders = (preset.envPlaceholders ?? []).length > 0

                      return (
                        <div
                          key={preset.id}
                          className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{preset.name}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${CATEGORY_COLORS[preset.category] ?? ''}`}
                                >
                                  {preset.category}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                            </div>
                            {isInstalled ? (
                              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 shrink-0">
                                <Check className="h-3 w-3 mr-1" />
                                Installed
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 shrink-0"
                                onClick={() => {
                                  if (hasEnvPlaceholders && !isConfiguring) {
                                    setInstallingId(preset.id)
                                  } else {
                                    handleInstall(preset)
                                  }
                                }}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Install
                              </Button>
                            )}
                          </div>

                          {isConfiguring && hasEnvPlaceholders && (
                            <div className="space-y-2 pt-1 border-t border-border/30">
                              {preset.envPlaceholders!.map((placeholder) => (
                                <div key={placeholder.key} className="space-y-1">
                                  <Label className="text-xs">
                                    {placeholder.label}
                                    {placeholder.required && <span className="text-red-400 ml-0.5">*</span>}
                                  </Label>
                                  <p className="text-[10px] text-muted-foreground">{placeholder.description}</p>
                                  <Input
                                    type="password"
                                    value={envInputs[preset.id]?.[placeholder.key] ?? ''}
                                    onChange={(e) =>
                                      setEnvInputs((prev) => ({
                                        ...prev,
                                        [preset.id]: {
                                          ...(prev[preset.id] ?? {}),
                                          [placeholder.key]: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder={placeholder.label}
                                    className="h-8 text-xs font-mono"
                                  />
                                </div>
                              ))}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => handleInstall(preset)}
                                >
                                  Confirm Install
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-7"
                                  onClick={() => setInstallingId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
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
          </TabsContent>

          <TabsContent value="file" className="flex-1 mt-4 overflow-auto">
            <FileImportTab onSuccess={() => onOpenChange(false)} />
          </TabsContent>

          <TabsContent value="url" className="flex-1 mt-4 overflow-auto">
            <UrlImportTab onSuccess={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
