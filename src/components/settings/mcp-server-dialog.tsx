import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useMcpStore } from '@/stores/mcp-store'
import type { McpServerConfig } from '@/types'

interface McpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editServerId: string | null
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

export function McpServerDialog({ open, onOpenChange, editServerId }: McpServerDialogProps) {
  const { servers, addServer, updateServer } = useMcpStore()
  const editingServer = editServerId ? servers.find((s) => s.id === editServerId) : null

  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [envVars, setEnvVars] = useState('')
  const [url, setUrl] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testResult, setTestResult] = useState<string>('')

  useEffect(() => {
    if (editingServer) {
      setName(editingServer.name)
      setTransport(editingServer.transport)
      setCommand(editingServer.command ?? '')
      setArgs(editingServer.args?.join(' ') ?? '')
      setEnvVars(
        Object.entries(editingServer.env ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      )
      setUrl(editingServer.url ?? '')
    } else {
      setName('')
      setTransport('stdio')
      setCommand('')
      setArgs('')
      setEnvVars('')
      setUrl('')
    }
    setTestStatus('idle')
    setTestResult('')
  }, [editingServer, open])

  const parseEnvVars = (): Record<string, string> => {
    const env: Record<string, string> = {}
    for (const line of envVars.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    }
    return env
  }

  const buildConfig = (): Omit<McpServerConfig, 'id' | 'createdAt'> => ({
    name: name.trim(),
    transport,
    ...(transport === 'stdio'
      ? {
          command: command.trim(),
          args: args.trim() ? args.trim().split(/\s+/) : [],
          env: parseEnvVars(),
        }
      : { url: url.trim() }),
  })

  const handleSave = () => {
    if (!name.trim()) return
    if (transport === 'stdio' && !command.trim()) return
    if (transport === 'sse' && !url.trim()) return

    const config = buildConfig()

    if (editingServer) {
      updateServer(editingServer.id, config)
    } else {
      addServer(config)
    }
    onOpenChange(false)
  }

  const handleTest = async () => {
    setTestStatus('testing')
    setTestResult('')
    try {
      const config = {
        ...buildConfig(),
        id: editingServer?.id ?? 'test-' + Date.now(),
        createdAt: Date.now(),
      }
      const res = await fetch('/api/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (data.success) {
        setTestStatus('success')
        setTestResult(`Found ${data.toolCount} tool${data.toolCount !== 1 ? 's' : ''}: ${data.tools.map((t: { name: string }) => t.name).join(', ')}`)
      } else {
        setTestStatus('error')
        setTestResult(data.error)
      }
    } catch (err) {
      setTestStatus('error')
      setTestResult(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingServer ? 'Edit' : 'Add'} MCP Server</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My MCP Server"
            />
          </div>

          <div className="space-y-2">
            <Label>Transport</Label>
            <Select value={transport} onValueChange={(v) => setTransport(v as 'stdio' | 'sse')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">Stdio (local process)</SelectItem>
                <SelectItem value="sse">SSE (remote server)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {transport === 'stdio' ? (
            <>
              <div className="space-y-2">
                <Label>Command</Label>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Arguments</Label>
                <Input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Environment Variables</Label>
                <textarea
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  placeholder={"API_KEY=xxx\nANOTHER_VAR=yyy"}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={2}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Server URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3002/sse"
                className="font-mono text-sm"
              />
            </div>
          )}

          {/* Test Connection */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testStatus === 'testing' || !name.trim() || (transport === 'stdio' ? !command.trim() : !url.trim())}
            >
              {testStatus === 'testing' && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              Test Connection
            </Button>
            {testStatus === 'success' && (
              <div className="flex items-start gap-2 text-xs text-emerald-400">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{testResult}</span>
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-start gap-2 text-xs text-red-400">
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{testResult}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {editingServer ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
