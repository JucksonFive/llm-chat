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
import { Plus, Trash2, BrainCircuit } from 'lucide-react'
import { useMemoryStore } from '@/stores/memory-store'
import { useAgentStore } from '@/stores/agent-store'

interface MemoryPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MemoryPanel({ open, onOpenChange }: MemoryPanelProps) {
  const [newMemory, setNewMemory] = useState('')
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const { addMemory, deleteMemory, getMemoriesForAgent } = useMemoryStore()

  const agent = agents.find((a) => a.id === activeAgentId)
  const memories = activeAgentId ? getMemoriesForAgent(activeAgentId) : []

  const handleAdd = () => {
    if (!newMemory.trim() || !activeAgentId) return
    addMemory(activeAgentId, newMemory.trim())
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
          <p className="text-xs text-muted-foreground">
            Memories are injected into the system prompt to personalize responses across conversations.
          </p>

          <div className="flex gap-2">
            <Input
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a memory..."
              className="flex-1"
            />
            <Button size="icon" onClick={handleAdd} disabled={!newMemory.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-2">
              {memories.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No memories yet. Add some to personalize this agent's responses.
                </p>
              )}
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="group flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3"
                >
                  <p className="flex-1 text-sm">{memory.content}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteMemory(memory.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
