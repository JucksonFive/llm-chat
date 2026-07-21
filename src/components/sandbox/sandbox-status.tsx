import { useEffect, useState } from 'react'
import { Check, X, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DriverStatus {
  runtime: string
  kind: string
  available: boolean
}

interface SandboxStatusProps {
  className?: string
}

export function SandboxStatus({ className }: SandboxStatusProps) {
  const [drivers, setDrivers] = useState<DriverStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/sandbox/status')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setDrivers(data.drivers || [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const hasAvailableDriver = drivers.some((d) => d.available)
  const hasWindowsDriver = drivers.some((d) => d.runtime === 'windows-powershell')

  return (
    <div className={cn('space-y-2 text-sm', className)}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Sandbox
        </span>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : error ? (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        ) : hasAvailableDriver ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <X className="h-3 w-3 text-red-500" />
        )}
      </div>

      {!loading && !error && drivers.map((d) => (
        <div
          key={d.runtime}
          className={cn(
            'flex items-center justify-between text-xs px-2 py-1 rounded',
            d.available
              ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <span>{d.runtime === 'wsl-pwsh' ? 'WSL (bwrap)' : 'Windows'}</span>
          <span>{d.available ? 'Ready' : 'Unavailable'}</span>
        </div>
      ))}

      {!loading && !error && !hasAvailableDriver && (
        <p className="text-[10px] text-muted-foreground">
          No sandbox drivers available. Install WSL2 and bubblewrap, or configure a Windows sandbox.
        </p>
      )}

      {!loading && !error && hasWindowsDriver && (
        <p className="text-[10px] text-muted-foreground">
          Windows driver is not yet implemented. Use WSL runtime for sandboxed execution.
        </p>
      )}
    </div>
  )
}
