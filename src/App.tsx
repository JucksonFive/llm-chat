import { useEffect } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { ChatLayout } from '@/components/layout/chat-layout'
import { useUIStore } from '@/stores/ui-store'

export default function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

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
