import { useState } from 'react'
import { Check, X, AlertCircle, Loader2, Server, Globe, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { McpServerImport } from '@/types'
import type { ValidationResult } from '@/lib/mcp-import-validator'

interface McpImportPreviewProps {
  config: McpServerImport
  validation: ValidationResult
  onInstall: (config: McpServerImport) => Promise<void>
  onCancel?: () => void
}

export function McpImportPreview({ config, validation, onInstall, onCancel }: McpImportPreviewProps) {
  const [isInstalling, setIsInstalling] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transport: config.transport,
          command: config.command,
          args: config.args,
          env: config.env,
          url: config.url,
        }),
      })

      const data = await response.json()

      if (response.ok && data.tools !== undefined) {
        setTestResult({
          success: true,
          message: `Connected successfully! Found ${data.tools} tool(s), ${data.resources ?? 0} resource(s), ${data.prompts ?? 0} prompt(s)`,
        })
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Connection failed',
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleInstall = async () => {
    setIsInstalling(true)
    try {
      await onInstall(config)
    } finally {
      setIsInstalling(false)
    }
  }

  const transportIcon = {
    stdio: <Terminal className="h-4 w-4" />,
    sse: <Globe className="h-4 w-4" />,
    'streamable-http': <Server className="h-4 w-4" />,
  }[config.transport]

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">{config.name}</h3>
              {validation.valid ? (
                <Check className="h-5 w-5 text-emerald-500" />
              ) : (
                <X className="h-5 w-5 text-red-500" />
              )}
            </div>
            {config.description && (
              <p className="text-sm text-muted-foreground">{config.description}</p>
            )}
          </div>
          {config.category && (
            <Badge variant="outline" className="ml-2">
              {config.category}
            </Badge>
          )}
        </div>

        {/* Transport Info */}
        <div className="flex items-center gap-2 text-sm">
          {transportIcon}
          <span className="font-medium">{config.transport}</span>
          {config.transport === 'stdio' && config.command && (
            <code className="ml-2 rounded bg-muted px-2 py-0.5 text-xs">
              {config.command} {config.args?.join(' ')}
            </code>
          )}
          {(config.transport === 'sse' || config.transport === 'streamable-http') && config.url && (
            <code className="ml-2 rounded bg-muted px-2 py-0.5 text-xs truncate max-w-md">
              {config.url}
            </code>
          )}
        </div>

        {/* Environment Variables */}
        {config.env && Object.keys(config.env).length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Environment Variables
            </span>
            <div className="rounded-lg bg-muted/30 p-2 space-y-1">
              {Object.entries(config.env).map(([key, value]) => (
                <div key={key} className="text-xs font-mono flex gap-2">
                  <span className="text-muted-foreground">{key}:</span>
                  <span className="truncate">{value.length > 40 ? `${value.slice(0, 40)}...` : value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {validation.errors.length > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
              <X className="h-4 w-4" />
              <span>Validation Errors</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-red-600 dark:text-red-400">
              {validation.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Validation Warnings */}
        {validation.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>Warnings</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
              {validation.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              testResult.success
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                : 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
            }`}
          >
            {testResult.message}
          </div>
        )}

        {/* Homepage Link */}
        {config.homepage && (
          <a
            href={config.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
          >
            <Globe className="h-3 w-3" />
            Documentation
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-border/50 p-4 flex items-center gap-2 bg-muted/20">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={!validation.valid || isTesting || isInstalling}
        >
          {isTesting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Test Connection
        </Button>
        <Button
          onClick={handleInstall}
          size="sm"
          disabled={!validation.valid || isInstalling}
        >
          {isInstalling && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          Install
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isInstalling}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
