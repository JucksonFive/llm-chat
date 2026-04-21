import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Brain, Sparkles, Gem, HardDrive, Waves, Cpu } from 'lucide-react'
import { PROVIDER_LIST } from '@/lib/providers'
import type { ProviderId } from '@/types'

const ICONS: Record<ProviderId, React.ElementType> = {
  openai: Brain,
  anthropic: Sparkles,
  google: Gem,
  ollama: HardDrive,
  deepseek: Waves,
  local: Cpu,
}

interface ProviderSelectProps {
  value: ProviderId
  onValueChange: (value: ProviderId) => void
}

export function ProviderSelect({ value, onValueChange }: ProviderSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select provider" />
      </SelectTrigger>
      <SelectContent>
        {PROVIDER_LIST.map((provider) => {
          const Icon = ICONS[provider.id]
          return (
            <SelectItem key={provider.id} value={provider.id}>
              <div className="flex items-center gap-2">
                <Icon
                  className="h-4 w-4"
                  style={{ color: provider.color }}
                />
                <span>{provider.name}</span>
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
