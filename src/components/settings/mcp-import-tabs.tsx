import { useState, useCallback } from 'react'
import { Upload, Link as LinkIcon, Loader2, Terminal } from 'lucide-react'
import { parseCommand, deriveServerName, buildConnectionSummary } from './mcp-npx-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { McpImportPreview } from './mcp-import-preview'
import { validateMcpImport, parseImportPayload } from '@/lib/mcp-import-validator'
import { useMcpStore } from '@/stores/mcp-store'
import type { McpServerImport } from '@/types'
import { apiFetch } from '@/lib/api-fetch'

interface McpImportTabsProps {
  onSuccess?: () => void
}

export function FileImportTab({ onSuccess }: McpImportTabsProps) {
  const [importedConfigs, setImportedConfigs] = useState<McpServerImport[]>([])
  const [dragOver, setDragOver] = useState(false)
  const addServer = useMcpStore((s) => s.addServer)

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const data = JSON.parse(text)
        const { servers, error } = parseImportPayload(data)

        if (error) {
          toast.error(error)
          return
        }

        if (servers.length === 0) {
          toast.error('No valid server configurations found')
          return
        }

        setImportedConfigs(servers)
        toast.success(`Loaded ${servers.length} configuration(s)`)
      } catch (error) {
        toast.error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Invalid JSON'}`)
      }
    }
    reader.onerror = () => {
      toast.error('Failed to read file')
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)

      const file = e.dataTransfer.files[0]
      if (!file) return

      if (!file.name.endsWith('.json')) {
        toast.error('Please select a JSON file')
        return
      }

      handleFile(file)
    },
    [handleFile]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      handleFile(file)
    },
    [handleFile]
  )

  const handleInstall = async (config: McpServerImport) => {
    try {
      await addServer({
        name: config.name,
        transport: config.transport,
        command: config.command,
        args: config.args,
        env: config.env,
        url: config.url,
      })
      toast.success(`${config.name} installed successfully`)

      // Remove from list after install
      setImportedConfigs((prev) => prev.filter((c) => c.name !== config.name))

      if (importedConfigs.length === 1) {
        onSuccess?.()
      }
    } catch (error) {
      toast.error(`Failed to install: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="space-y-4">
      {importedConfigs.length === 0 ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-border'
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Import from File</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop a JSON file here, or click to browse
          </p>
          <label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="hidden"
            />
            <Button variant="outline" size="sm" asChild>
              <span>Select File</span>
            </Button>
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          {importedConfigs.map((config, idx) => {
            const validation = validateMcpImport(config)
            return (
              <McpImportPreview
                key={idx}
                config={config}
                validation={validation}
                onInstall={handleInstall}
                onCancel={() => setImportedConfigs((prev) => prev.filter((_, i) => i !== idx))}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export function UrlImportTab({ onSuccess }: McpImportTabsProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [importedConfigs, setImportedConfigs] = useState<McpServerImport[]>([])
  const addServer = useMcpStore((s) => s.addServer)

  const handleFetch = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const { servers, error } = parseImportPayload(data)

      if (error) {
        toast.error(error)
        return
      }

      if (servers.length === 0) {
        toast.error('No valid server configurations found')
        return
      }

      setImportedConfigs(servers)
      toast.success(`Loaded ${servers.length} configuration(s)`)
    } catch (error) {
      toast.error(`Failed to fetch: ${error instanceof Error ? error.message : 'Network error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInstall = async (config: McpServerImport) => {
    try {
      await addServer({
        name: config.name,
        transport: config.transport,
        command: config.command,
        args: config.args,
        env: config.env,
        url: config.url,
      })
      toast.success(`${config.name} installed successfully`)

      // Remove from list after install
      setImportedConfigs((prev) => prev.filter((c) => c.name !== config.name))

      if (importedConfigs.length === 1) {
        setUrl('')
        onSuccess?.()
      }
    } catch (error) {
      toast.error(`Failed to install: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="space-y-4">
      {importedConfigs.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-8 text-center">
            <LinkIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />

            <h3 className="text-lg font-semibold mb-2">Import from URL</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Paste a URL to a JSON configuration file
            </p>
            <div className="flex gap-2 max-w-xl mx-auto">
              <Input
                placeholder="https://example.com/mcp-config.json"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              />
              <Button onClick={handleFetch} disabled={isLoading || !url.trim()}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Fetch
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {importedConfigs.map((config, idx) => {
            const validation = validateMcpImport(config)
            return (
              <McpImportPreview
                key={idx}
                config={config}
                validation={validation}
                onInstall={handleInstall}
                onCancel={() => {
                  setImportedConfigs((prev) => prev.filter((_, i) => i !== idx))
                  if (importedConfigs.length === 1) {
                    setUrl('')
                  }
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

type InstallPhase = 'idle' | 'saving' | 'connecting' | 'done' | 'error'

export function NpxInstallTab({ onSuccess }: McpImportTabsProps) {
  const [input, setInput] = useState('')
  const [serverName, setServerName] = useState('')
  const [phase, setPhase] = useState<InstallPhase>('idle')
  const [testResult, setTestResult] = useState<string>('')
  const addServer = useMcpStore((s) => s.addServer)

  const parsed = input.trim() ? parseCommand(input) : null
  const derivedName = serverName || (input.trim() ? deriveServerName(input) : '')
  const busy = phase === 'saving' || phase === 'connecting'

  const handleInstall = async () => {
    if (!parsed) return

    setPhase('saving')
    setTestResult('')
    let serverId: string
    try {
      const server = await addServer({
        name: derivedName || input.trim(),
        transport: 'stdio',
        command: parsed.command,
        args: parsed.args,
      })
      serverId = server.id
    } catch (error) {
      setPhase('error')
      setTestResult(error instanceof Error ? error.message : 'Failed to save')
      return
    }

    setPhase('connecting')
    try {
      const res = await apiFetch('/api/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: serverId,
          name: derivedName || input.trim(),
          transport: 'stdio',
          command: parsed.command,
          args: parsed.args,
          createdAt: Date.now(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTestResult(buildConnectionSummary(data.toolCount, data.resourceCount))
        setPhase('done')
        setInput('')
        setServerName('')
        setTimeout(() => {
          setPhase('idle')
          onSuccess?.()
        }, 1500)
      } else {
        setPhase('error')
        setTestResult(data.error ?? 'Connection failed')
      }
    } catch (error) {
      setPhase('error')
      setTestResult(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-8 text-center">
        <Terminal className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">Install via npx</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Paste a package name or full install command
        </p>
        <div className="space-y-3 max-w-sm mx-auto text-left">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Package or command</label>
            <Input
              placeholder="obsidian-mcp-seekstone  or  npx skillfish add repo/name"
              value={input}
              onChange={(e) => { setInput(e.target.value); setPhase('idle'); setTestResult('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
              className="font-mono text-sm"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Server name <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <Input
              placeholder={derivedName || 'my-server'}
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
              className="text-sm"
              disabled={busy}
            />
          </div>
          {parsed && (
            <div className="rounded-md bg-muted/50 border border-border/50 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-0.5">Command preview</p>
              <code className="text-xs font-mono">{parsed.preview}</code>
            </div>
          )}
          {phase !== 'idle' && (
            <div className={`flex items-start gap-2 text-xs rounded-md px-3 py-2 ${
              phase === 'done' ? 'text-emerald-400 bg-emerald-500/5' :
              phase === 'error' ? 'text-red-400 bg-red-500/5' :
              'text-muted-foreground bg-muted/40'
            }`}>
              {busy && <Loader2 className="h-3.5 w-3.5 mt-0.5 shrink-0 animate-spin" />}
              <span>
                {phase === 'saving' && 'Saving configuration…'}
                {phase === 'connecting' && 'Connecting (this may take a moment while npx downloads the package)…'}
                {phase === 'done' && testResult}
                {phase === 'error' && testResult}
              </span>
            </div>
          )}
          <Button
            className="w-full"
            onClick={handleInstall}
            disabled={!input.trim() || busy}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {phase === 'saving' ? 'Saving…' : phase === 'connecting' ? 'Connecting…' : 'Install'}
          </Button>
        </div>
      </div>
    </div>
  )
}
