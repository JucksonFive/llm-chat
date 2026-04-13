import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Wrench, Check, X, Loader2, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ToolCallInfo } from '@/types'

interface ToolCallBlockProps {
  toolCall: ToolCallInfo
}

export function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon = {
    calling: <Loader2 className="h-3 w-3 animate-spin" />,
    complete: <Check className="h-3 w-3" />,
    error: <X className="h-3 w-3" />,
  }[toolCall.status]

  const statusColor = {
    calling: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    complete: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    error: 'bg-red-500/10 text-red-400 border-red-500/30',
  }[toolCall.status]

  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  return (
    <div className="my-2 rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <code className="font-mono text-xs font-medium flex-1">{toolCall.toolName}</code>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor}`}>
          {statusIcon}
          <span className="ml-1">{toolCall.status}</span>
        </Badge>
        <ChevronDown
          className={`h-3 w-3 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 px-3 py-2 space-y-2">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Input</span>
                <pre className="mt-1 rounded bg-muted/40 p-2 text-xs overflow-x-auto max-h-40">
                  <code>{formatValue(toolCall.args)}</code>
                </pre>
              </div>
              {toolCall.status === 'complete' && toolCall.result !== undefined && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-medium">Output</span>
                  <pre className="mt-1 rounded bg-muted/40 p-2 text-xs overflow-x-auto max-h-60">
                    <code>{formatValue(toolCall.result)}</code>
                  </pre>
                </div>
              )}
              {toolCall.status === 'error' && toolCall.error && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-red-400 font-medium">Error</span>
                  <p className="mt-1 text-xs text-red-400">{toolCall.error}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
