import { useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
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
import { BrainCircuit, Volume2, VolumeX, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getModelCapabilities } from '@/lib/model-capabilities'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'
import { useMemoryStore } from '@/stores/memory-store'
import { useUIStore } from '@/stores/ui-store'
import { MemoryPanel } from '@/components/memory/memory-panel'
import { PROVIDERS, PROVIDER_LIST } from '@/lib/providers'
import type { ProviderId } from '@/types'

export function Header() {
  const { agents, activeAgentId, updateAgent } = useAgentStore()
  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const activeConversation = useChatStore((s) =>
    activeConversationId ? s.conversations[activeConversationId] : null
  )
  const provider = activeAgent ? PROVIDERS[activeAgent.providerId] : null
  const allMemories = useMemoryStore((s) => s.memories)
  const getRecentlyUsedMemories = useMemoryStore((s) => s.getRecentlyUsedMemories)
  const memories = activeAgentId
    ? allMemories.filter((m) => m.agentId === activeAgentId)
    : []
  const recentlyUsedCount = activeAgentId
    ? getRecentlyUsedMemories(activeAgentId).length
    : 0
  const [memoryOpen, setMemoryOpen] = useState(false)
  const { autoSpeak, toggleAutoSpeak } = useUIStore()
  const modelCapabilities = activeAgent ? getModelCapabilities(activeAgent.model) : null

  const handleProviderChange = (newProviderId: string) => {
    if (activeAgent) {
      const newProvider = PROVIDERS[newProviderId as ProviderId]
      const newModel = newProvider.freeTextModel
        ? activeAgent.model
        : newProvider.models[0]
      updateAgent(activeAgent.id, { providerId: newProviderId as ProviderId, model: newModel })
    }
  }

  const handleModelChange = (newModel: string) => {
    if (activeAgent) {
      updateAgent(activeAgent.id, { model: newModel })
    }
  }

  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border/50 bg-background/90 px-2 backdrop-blur-xl sm:gap-3 sm:px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-5" />
        {activeAgent && provider ? (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
              <span className="hidden max-w-64 truncate text-sm font-medium sm:inline">
                {activeConversation?.title ?? activeAgent.name}
              </span>
              <Select value={activeAgent.providerId} onValueChange={handleProviderChange}>
                <SelectTrigger
                  className="h-7 w-auto gap-1 border-border/50 text-xs font-medium px-2 shrink-0"
                  style={{ color: provider.color }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_LIST.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <span style={{ color: p.color }}>{p.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {provider.freeTextModel ? (
                <Input
                  value={activeAgent.model}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="h-7 w-32 sm:w-40 text-xs shrink-0"
                />
              ) : (
                <Select value={activeAgent.model} onValueChange={handleModelChange}>
                  <SelectTrigger className="h-7 w-auto gap-1 border-border/50 text-xs font-mono shrink-0">
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
              {modelCapabilities?.reasoning && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="hidden sm:flex h-6 items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0">
                      <Sparkles className="h-3 w-3" />
                      <span>Reasoning</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>This agent uses extended reasoning for complex questions</TooltipContent>
                </Tooltip>
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
                  className={cn(
                    'relative',
                    recentlyUsedCount > 0 && 'text-purple-500 dark:text-purple-400'
                  )}
                  onClick={() => setMemoryOpen(true)}
                >
                  <BrainCircuit className={cn(
                    'h-4 w-4',
                    recentlyUsedCount > 0 && 'animate-pulse'
                  )} />
                  {memories.length > 0 && (
                    <span className={cn(
                      'absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white',
                      recentlyUsedCount > 0
                        ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                        : 'bg-purple-500'
                    )}>
                      {memories.length}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {recentlyUsedCount > 0
                  ? `Memory: ${recentlyUsedCount} active (${memories.length} total)`
                  : `Memories: ${memories.length}`}
              </TooltipContent>
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
