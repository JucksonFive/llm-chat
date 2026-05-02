import { ChatWindow } from '@/components/chat/chat-window'
import { EmptyState } from '@/components/chat/empty-state'
import { MessageInput } from '@/components/chat/message-input'
import { Header } from '@/components/layout/header'
import { SidebarInset } from '@/components/ui/sidebar'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'
import { useEffect } from 'react'

export function ChatLayout() {
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
    </SidebarInset>
  )
}
