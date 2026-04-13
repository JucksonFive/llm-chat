import { SidebarInset } from '@/components/ui/sidebar'
import { Header } from '@/components/layout/header'
import { ChatWindow } from '@/components/chat/chat-window'
import { MessageInput } from '@/components/chat/message-input'
import { EmptyState } from '@/components/chat/empty-state'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'

export function ChatLayout() {
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const activeConversation = activeConversationId
    ? conversations[activeConversationId]
    : null

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
