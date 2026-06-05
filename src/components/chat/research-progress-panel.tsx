import { motion, AnimatePresence } from 'motion/react'
import { Check, Loader2, Minimize2, Maximize2, X, ExternalLink } from 'lucide-react'
import { useResearchStore, type ResearchStage } from '@/stores/research-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const STAGE_INFO: Record<ResearchStage, { label: string; description: string }> = {
  planning: { label: 'Planning', description: 'Analyzing query and formulating research strategy' },
  searching: { label: 'Web Search', description: 'Searching for relevant sources across the web' },
  fetching: { label: 'Fetch Sources', description: 'Retrieving and reading source content' },
  analyzing: { label: 'Analyzing', description: 'Extracting key information from sources' },
  synthesizing: { label: 'Synthesizing', description: 'Combining findings into coherent insights' },
  reporting: { label: 'Reporting', description: 'Generating final research report' },
}

const STAGE_ORDER: ResearchStage[] = ['planning', 'searching', 'fetching', 'analyzing', 'synthesizing', 'reporting']

function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function StageCard({ stage, isActive, isComplete, timing }: {
  stage: ResearchStage
  isActive: boolean
  isComplete: boolean
  timing: number
}) {
  const [elapsed, setElapsed] = useState(0)
  const info = STAGE_INFO[stage]

  useEffect(() => {
    if (!isActive || timing === 0) return
    const interval = setInterval(() => {
      setElapsed(Date.now() - timing)
    }, 100)
    return () => clearInterval(interval)
  }, [isActive, timing])

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative rounded-lg border p-4 transition-all',
        isActive && 'border-primary bg-primary/5',
        isComplete && 'border-border/50 bg-muted/30',
        !isActive && !isComplete && 'border-border/30 bg-background/50'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
          isActive && 'bg-primary text-primary-foreground',
          isComplete && 'bg-primary text-primary-foreground',
          !isActive && !isComplete && 'bg-muted text-muted-foreground'
        )}>
          {isComplete ? (
            <Check className="h-4 w-4" />
          ) : isActive ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-current" />
          )}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className={cn(
              'font-medium text-sm',
              isActive && 'text-primary',
              !isActive && !isComplete && 'text-muted-foreground'
            )}>
              {info.label}
            </h4>
            {isActive && elapsed > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatElapsedTime(elapsed)}
              </span>
            )}
            {isComplete && timing > 0 && (
              <span className="text-xs text-muted-foreground">
                ✓ Done
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {info.description}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function SourceItem({ url, title, status }: { url: string; title: string; status: 'loading' | 'complete' | 'error' }) {
  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    } catch {
      return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group flex items-start gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 hover:bg-muted/40 transition-colors"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : status === 'error' ? (
          <div className="h-4 w-4 rounded-full bg-destructive/20 flex items-center justify-center">
            <X className="h-3 w-3 text-destructive" />
          </div>
        ) : (
          getFaviconUrl(url) ? (
            <img src={getFaviconUrl(url) || ''} alt="" className="h-4 w-4" />
          ) : (
            <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center">
              <Check className="h-3 w-3 text-primary" />
            </div>
          )
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium truncate">
          {title || 'Loading...'}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 truncate"
        >
          {url}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </motion.div>
  )
}

export function ResearchProgressPanel() {
  const { activeResearchId, researches, togglePanel, clearResearch } = useResearchStore()
  const research = activeResearchId ? researches[activeResearchId] : null

  const [totalElapsed, setTotalElapsed] = useState(0)

  useEffect(() => {
    if (!research) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial elapsed time calculation
    setTotalElapsed(Date.now() - research.startTime)
    const interval = setInterval(() => {
      setTotalElapsed(Date.now() - research.startTime)
    }, 1000)
    return () => clearInterval(interval)
  }, [research?.startTime, research])

  if (!activeResearchId || !research) return null

  const currentStageIndex = STAGE_ORDER.indexOf(research.stage)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none"
      >
        {/* Backdrop */}
        {!research.isPanelMinimized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm pointer-events-auto"
            onClick={() => togglePanel(activeResearchId)}
          />
        )}

        {/* Panel */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: research.isPanelMinimized ? 'calc(100% - 64px)' : 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className={cn(
            'relative w-full max-w-4xl pointer-events-auto',
            research.isPanelMinimized ? 'h-16' : 'h-[90vh]'
          )}
        >
          <div className="h-full rounded-t-2xl border border-b-0 bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Deep Research in Progress</h2>
                  <p className="text-xs text-muted-foreground">
                    {STAGE_INFO[research.stage].label} • {formatElapsedTime(totalElapsed)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => togglePanel(activeResearchId)}
                  className="h-8 w-8"
                >
                  {research.isPanelMinimized ? (
                    <Maximize2 className="h-4 w-4" />
                  ) : (
                    <Minimize2 className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => clearResearch(activeResearchId)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            {!research.isPanelMinimized && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium">{Math.round(research.progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${research.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Stages */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Research Stages</h3>
                  <div className="grid gap-3">
                    {STAGE_ORDER.map((stage, index) => {
                      const isActive = stage === research.stage
                      const isComplete = index < currentStageIndex
                      const timing = research.stageTimings[stage]
                      return (
                        <StageCard
                          key={stage}
                          stage={stage}
                          isActive={isActive}
                          isComplete={isComplete}
                          timing={timing}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Sources */}
                {research.sources.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">
                      Sources Discovered ({research.sources.length})
                    </h3>
                    <div className="grid gap-2">
                      {research.sources.map((source, index) => (
                        <SourceItem key={index} {...source} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
