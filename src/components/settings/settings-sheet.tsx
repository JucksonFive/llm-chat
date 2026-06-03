import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Download, Upload } from 'lucide-react'
import { ThemeToggle } from '@/components/settings/theme-toggle'
import { McpServersSection } from '@/components/settings/mcp-servers-section'
import { IndexedDocumentsSection } from '@/components/settings/indexed-documents-section'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import { useMemoryStore } from '@/stores/memory-store'
import { useMcpStore } from '@/stores/mcp-store'
import { toast } from 'sonner'

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const [activeTab, setActiveTab] = useState('appearance')

  const handleExport = () => {
    const data = {
      agents: useAgentStore.getState().agents,
      conversations: useChatStore.getState().conversations,
      memories: useMemoryStore.getState().memories,
      mcpServers: useMcpStore.getState().servers,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `llm-chat-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Data exported successfully')
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (data.agents) {
          const agentStore = useAgentStore.getState()
          for (const agent of data.agents) {
            agentStore.addAgent(agent)
          }
        }
        if (data.memories) {
          const memoryStore = useMemoryStore.getState()
          for (const memory of data.memories) {
            memoryStore.addMemory(memory.agentId, memory.content)
          }
        }
        if (data.mcpServers) {
          const mcpStore = useMcpStore.getState()
          for (const server of data.mcpServers) {
            mcpStore.addServer(server)
          }
        }
        toast.success('Data imported successfully')
      } catch {
        toast.error('Failed to import data')
      }
    }
    input.click()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="appearance" className="text-xs">Appearance</TabsTrigger>
            <TabsTrigger value="data" className="text-xs">Data</TabsTrigger>
            <TabsTrigger value="mcp" className="text-xs">MCP</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs">Docs</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <TabsContent value="appearance" className="mt-0 space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-3">Theme</h3>
                <ThemeToggle />
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-1">About</h3>
                <p className="text-xs text-muted-foreground">
                  LLM Chat v0.0.1 — A multi-provider AI chat interface.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="data" className="mt-0 space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-3">Export & Import</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleExport}
                  >
                    <Download className="h-4 w-4" />
                    Export All Data
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleImport}
                  >
                    <Upload className="h-4 w-4" />
                    Import Data
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Export your agents, conversations, and settings. Import from a previous backup.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="mcp" className="mt-0">
              <McpServersSection />
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <IndexedDocumentsSection />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
