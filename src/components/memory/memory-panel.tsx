import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash2, BrainCircuit, Clock, Database } from 'lucide-react'
import { useMemoryStore } from '@/stores/memory-store'
import { useAgentStore } from '@/stores/agent-store'
import { cn } from '@/lib/utils'

interface MemoryPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function MemoryPanel({ open, onOpenChange }: MemoryPanelProps) {
  const [newMemory, setNewMemory] = useState('')
  const [activeTab, setActiveTab] = useState<'long' | 'short'>('long')
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const { addMemory, deleteMemory, getShortTermMemories, getLongTermMemories, clearShortTermMemories } = useMemoryStore()

  const agent = agents.find((a) => a.id === activeAgentId)
  const shortMemories = activeAgentId ? getShortTermMemories(activeAgentId) : []
  const longMemories = activeAgentId ? getLongTermMemories(activeAgentId) : []
  const memories = activeTab === 'short' ? shortMemories : longMemories

  const handleAdd = () => {
    if (!newMemory.trim() || !activeAgentId) return
    addMemory(activeAgentId, newMemory.trim(), activeTab)
    setNewMemory('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-purple-400" />
            Memories
            {agent && (
              <span className="text-sm font-normal text-muted-foreground">
                for {agent.name}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex rounded-lg border border-border/50 p-0.5">
            <button
              type="button"
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'long'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('long')}
            >
              <Database className="h-3 w-3" />
              Long-term
              {longMemories.length > 0 && (
                <span className="ml-1 rounded-full bg-background/20 px-1.5 text-[10px]">
                  {longMemories.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'short'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('short')}
            >
              <Clock className="h-3 w-3" />
              Short-term
              {shortMemories.length > 0 && (
                <span className="ml-1 rounded-full bg-background/20 px-1.5 text-[10px]">
                  {shortMemories.length}
                </span>
              )}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {activeTab === 'long'
              ? 'Persistent facts, preferences, and key information that carry across all conversations.'
              : 'Recent context and conversation summaries. Automatically limited to the last 10 entries.'}
          </p>

          <div className="flex gap-2">
            <Input
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeTab === 'long' ? 'Add a permanent memory...' : 'Add a short-term note...'}
              className="flex-1"
            />
            <Button size="icon" onClick={handleAdd} disabled={!newMemory.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {activeTab === 'short' && shortMemories.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => activeAgentId && clearShortTermMemories(activeAgentId)}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Clear all short-term memories
            </Button>
          )}

          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-2">
              {memories.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {activeTab === 'long'
                    ? 'No long-term memories yet. Add facts and preferences to personalize responses.'
                    : 'No short-term memories yet. Add recent context or conversation notes.'}
                </p>
              )}
              {memories.map((memory) => {
                const wasRecentlyUsed =
                  memory.lastUsedAt !== undefined &&
                  Date.now() - memory.lastUsedAt < 5 * 60 * 1000

                return (
                  <div
                    key={memory.id}
                    className={cn(
                      'group flex items-start gap-2 rounded-lg border p-3 transition-all',
                      wasRecentlyUsed
                        ? 'border-l-2 border-l-purple-500 border-border/50 bg-purple-500/5'
                        : 'border-border/50 bg-muted/30'
                    )}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm">{memory.content}</p>
                      {wasRecentlyUsed && memory.lastUsedAt && (
                        <p className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                          <span className="text-sm leading-none">🧠</span>
                          Used {formatRelativeTime(memory.lastUsedAt)}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteMemory(memory.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
