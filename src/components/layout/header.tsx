import { useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { BrainCircuit, Volume2, VolumeX } from 'lucide-react'
import { useAgentStore } from '@/stores/agent-store'
import { useMemoryStore } from '@/stores/memory-store'
import { useUIStore } from '@/stores/ui-store'
import { MemoryPanel } from '@/components/memory/memory-panel'
import { PROVIDERS } from '@/lib/providers'

export function Header() {
  const { agents, activeAgentId, updateAgent } = useAgentStore()
  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const provider = activeAgent ? PROVIDERS[activeAgent.providerId] : null
  const allMemories = useMemoryStore((s) => s.memories)
  const memories = activeAgentId
    ? allMemories.filter((m) => m.agentId === activeAgentId)
    : []
  const [memoryOpen, setMemoryOpen] = useState(false)
  const { autoSpeak, toggleAutoSpeak } = useUIStore()

  const handleModelChange = (newModel: string) => {
    if (activeAgent) {
      updateAgent(activeAgent.id, { model: newModel })
    }
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur-xl">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-5" />
        {activeAgent && provider ? (
          <>
            <div className="flex items-center gap-2 flex-1">
              <span className="font-medium text-sm">{activeAgent.name}</span>
              <Badge
                variant="outline"
                className="text-xs font-normal px-1.5 py-0"
                style={{
                  borderColor: provider.color + '50',
                  color: provider.color,
                }}
              >
                {provider.name}
              </Badge>
              {provider.freeTextModel ? (
                <Input
                  value={activeAgent.model}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="h-7 w-40 text-xs"
                />
              ) : (
                <Select value={activeAgent.model} onValueChange={handleModelChange}>
                  <SelectTrigger className="h-7 w-auto gap-1 border-border/50 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {provider.models.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs font-mono">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleAutoSpeak}
                  className={autoSpeak ? 'text-primary' : ''}
                >
                  {autoSpeak ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{autoSpeak ? 'Voice replies ON' : 'Voice replies OFF'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={() => setMemoryOpen(true)}
                >
                  <BrainCircuit className="h-4 w-4" />
                  {memories.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-[10px] text-white">
                      {memories.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Memories</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Select an agent to start chatting
          </span>
        )}
      </header>
      <MemoryPanel open={memoryOpen} onOpenChange={setMemoryOpen} />
    </>
  )
}
