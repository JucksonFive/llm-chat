import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useUIStore } from '@/stores/ui-store'
import type { PermissionProfile } from '@/types'
import { cn } from '@/lib/utils'

const PROFILES: {
  value: PermissionProfile
  label: string
  icon: typeof Shield
  color: string
  description: string
}[] = [
  {
    value: 'workspace-write',
    label: 'Workspace',
    icon: ShieldCheck,
    color: 'text-emerald-500',
    description: 'Read/write within project workspace. Network blocked.',
  },
  {
    value: 'read-only',
    label: 'Read Only',
    icon: Shield,
    color: 'text-amber-500',
    description: 'Read within project workspace only. No writes or network.',
  },
  {
    value: 'full-access',
    label: 'Full Access',
    icon: ShieldAlert,
    color: 'text-red-500',
    description: 'Full filesystem + network access. Use with caution.',
  },
]

export function PermissionProfileSelector() {
  const profile = useUIStore((s) => s.permissionProfile)
  const setProfile = useUIStore((s) => s.setPermissionProfile)

  const active = PROFILES.find((p) => p.value === profile) ?? PROFILES[0]
  const Icon = active.icon

  const cycle = () => {
    const idx = PROFILES.findIndex((p) => p.value === profile)
    const next = PROFILES[(idx + 1) % PROFILES.length]
    setProfile(next.value)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 px-2 text-xs gap-1.5 transition-colors',
            active.color,
          )}
          onClick={cycle}
          aria-label={`Permission profile: ${active.label}. Click to change.`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{active.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px]">
        <p className="text-xs font-medium">{active.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {active.description}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Click to cycle: Workspace → Read Only → Full Access
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
