import { ChatWindow } from '@/components/chat/chat-window'
import { EmptyState } from '@/components/chat/empty-state'
import { MessageInput } from '@/components/chat/message-input'
import { ResearchProgressPanel } from '@/components/chat/research-progress-panel'
import { MessageSearchDialog } from '@/components/chat/message-search-dialog'
import { Header } from '@/components/layout/header'
import { SidebarInset } from '@/components/ui/sidebar'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'
import { useEffect, useState } from 'react'

export function ChatLayout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const loadMessages = useChatStore((s) => s.loadMessages)
  const activeConversation = activeConversationId
    ? conversations[activeConversationId]
    : null

  // Load messages when switching conversations
  useEffect(() => {
    if (activeConversationId && conversations[activeConversationId]?.messages.length === 0) {
      loadMessages(activeConversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, loadMessages])

  // Global keyboard shortcut for search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <SidebarInset className="flex flex-col">
      <Header />
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeAgentId && activeConversation ? (
          <>
            <ChatWindow conversation={activeConversation} />
            <MessageInput />
          </>
        ) : (
          <EmptyState hasAgent={!!activeAgentId} />
        )}
      </div>
      <ResearchProgressPanel />
      <MessageSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarInset>
  )
}
