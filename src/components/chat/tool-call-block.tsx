import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Search, Check, X, Loader2, ChevronDown, Globe, Code, FileText, AlertTriangle, Terminal } from 'lucide-react'
import type { ToolCallInfo } from '@/types'

interface ToolCallBlockProps {
  toolCall: ToolCallInfo
}

function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const deciseconds = Math.floor((ms % 1000) / 100)
  return `${seconds}.${deciseconds}s`
}

function renderToolIcon(toolName: string, className: string) {
  const name = toolName.toLowerCase()
  if (name.includes('search') || name.includes('web')) return <Search className={className} />
  if (name.includes('code')) return <Code className={className} />
  if (name.includes('file') || name.includes('read')) return <FileText className={className} />
  return <Globe className={className} />
}

function getToolDisplayName(toolName: string): string {
  // Convert snake_case to Title Case
  return toolName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    // If it looks like a simple string, just return it
    if (value.length < 200 && !value.includes('{') && !value.includes('[')) {
      return value
    }
  }
  try {
    const obj = typeof value === 'string' ? JSON.parse(value) : value
    // Format as readable key-value pairs instead of raw JSON
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      return Object.entries(obj)
        .map(([key, val]) => {
          const displayKey = key.replace(/_/g, ' ')
          let displayVal = String(val)
          if (displayVal.length > 100) displayVal = displayVal.slice(0, 100) + '...'
          return `${displayKey}: ${displayVal}`
        })
        .join('\n')
    }
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(value)
  }
}

export function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (toolCall.status === 'calling' && toolCall.startTime) {
      const interval = setInterval(() => {
        setElapsed(Date.now() - toolCall.startTime!)
      }, 100)
      return () => clearInterval(interval)
    }
  }, [toolCall.status, toolCall.startTime])

  const displayName = getToolDisplayName(toolCall.toolName)

  const statusConfig = {
    calling: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      bg: 'bg-blue-500/5',
      border: 'border-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
      badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    complete: {
      icon: <Check className="h-3 w-3" />,
      bg: 'bg-emerald-500/5',
      border: 'border-emerald-500/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    error: {
      icon: <X className="h-3 w-3" />,
      bg: 'bg-red-500/5',
      border: 'border-red-500/20',
      text: 'text-red-600 dark:text-red-400',
      badge: 'bg-red-500/10 text-red-600 dark:text-red-400',
    },
    'awaiting-approval': {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/30',
      text: 'text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    denied: {
      icon: <X className="h-3 w-3" />,
      bg: 'bg-red-500/5',
      border: 'border-red-500/20',
      text: 'text-red-600 dark:text-red-400',
      badge: 'bg-red-500/10 text-red-600 dark:text-red-400',
    },
  }[toolCall.status]

  const showProgressBar = toolCall.status === 'calling' && elapsed > 5000

  return (
    <div className={`my-2 rounded-xl border ${statusConfig.border} ${statusConfig.bg} overflow-hidden backdrop-blur-sm`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className={`p-1.5 rounded-lg ${statusConfig.badge}`}>
          {renderToolIcon(toolCall.toolName, "h-3.5 w-3.5")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${statusConfig.text}`}>{displayName}</span>
            {toolCall.status === 'calling' && elapsed > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {formatElapsedTime(elapsed)}
              </span>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${statusConfig.badge} text-[10px] font-medium`}>
          {statusConfig.icon}
          <span>
            {toolCall.status === 'calling' ? 'running'
              : toolCall.status === 'awaiting-approval' ? 'needs approval'
              : toolCall.status === 'denied' ? 'denied'
              : toolCall.status}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {showProgressBar && (
        <div className="h-0.5 bg-muted/40">
          <motion.div
            className="h-full bg-blue-500"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      )}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 px-4 py-3 space-y-3 text-sm">
              {/* Code executor warning — show exact command verbatim */}
              {toolCall.toolName === 'code_executor' && toolCall.args && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase">
                      This command will run with your user privileges. Review it carefully.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                    <Terminal className="h-3 w-3" />
                    <span className="font-medium">
                      {typeof toolCall.args.language === 'string'
                        ? toolCall.args.language.toUpperCase()
                        : 'UNKNOWN'}
                    </span>
                  </div>
                  <pre className="mt-1 rounded-md bg-muted/50 p-2.5 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                    {typeof toolCall.args.code === 'string'
                      ? toolCall.args.code
                      : JSON.stringify(toolCall.args.code)}
                  </pre>
                </div>
              )}
              {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parameters</span>
                  <div className="mt-1.5 rounded-lg bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                    {formatValue(toolCall.args)}
                  </div>
                </div>
              )}
              {toolCall.status === 'complete' && toolCall.result !== undefined && (
                <div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Result</span>
                  <div className="mt-1.5 rounded-lg bg-emerald-500/5 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                    {formatValue(toolCall.result)}
                  </div>
                </div>
              )}
              {toolCall.status === 'error' && toolCall.error && (
                <div>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Error</span>
                  <div className="mt-1.5 rounded-lg bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
                    {toolCall.error}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
