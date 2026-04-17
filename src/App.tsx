import { useEffect, useState } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { ChatLayout } from '@/components/layout/chat-layout'
import { useUIStore } from '@/stores/ui-store'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'
import { useMemoryStore } from '@/stores/memory-store'
import { useMcpStore } from '@/stores/mcp-store'
import { useProjectStore } from '@/stores/project-store'

export default function App() {
  const theme = useUIStore((s) => s.theme)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    Promise.all([
      useAgentStore.getState().loadAgents().catch(console.error),
      useChatStore.getState().loadConversations().catch(console.error),
      useMemoryStore.getState().loadMemories().catch(console.error),
      useMcpStore.getState().loadServers().catch(console.error),
      useProjectStore.getState().loadProjects().catch(console.error),
    ]).then(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex h-svh w-full overflow-hidden">
          <AppSidebar />
          <ChatLayout />
        </div>
        <Toaster position="bottom-right" theme={theme} />
      </SidebarProvider>
    </TooltipProvider>
  )
}
