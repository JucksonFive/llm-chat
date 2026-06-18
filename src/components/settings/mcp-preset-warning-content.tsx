import { ExternalLink, ShieldAlert, Terminal } from 'lucide-react'
import type { McpPresetWarning } from './mcp-preset-warning'

interface PresetWarningContentProps {
  warning: McpPresetWarning
  presetName: string
}

/**
 * Presentational body of the preset security-warning modal.
 *
 * Kept free of dialog/portal wrappers and side effects so it renders under
 * `renderToStaticMarkup` and is straightforward to test. The exact command is
 * shown verbatim for stdio presets, with a "View source" link when a source
 * URL is available.
 */
export function PresetWarningContent({ warning, presetName }: PresetWarningContentProps) {
  const isHigh = warning.severity === 'high'
  const accent = isHigh
    ? 'text-red-400 border-red-400/30 bg-red-400/10'
    : 'text-amber-400 border-amber-400/30 bg-amber-400/10'

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 rounded-md border p-3 ${accent}`}>
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-xs leading-relaxed">{warning.message}</p>
      </div>

      {warning.command && (
        <div className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Command to run
          </span>
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/50 p-2">
            <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <code
              className="text-xs font-mono break-all text-foreground"
              data-testid="preset-command"
            >
              {warning.command}
            </code>
          </div>
        </div>
      )}

      {warning.sourceUrl && (
        <a
          href={warning.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          View source for {presetName}
        </a>
      )}
    </div>
  )
}
