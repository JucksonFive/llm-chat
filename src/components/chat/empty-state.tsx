import { MessageSquarePlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'

interface EmptyStateProps {
  hasAgent: boolean
}

export function EmptyState({ hasAgent }: EmptyStateProps) {
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const createConversation = useChatStore((s) => s.createConversation)

  const handleNewChat = async () => {
    if (!activeAgentId) return
    await createConversation(activeAgentId)
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
          <MessageSquarePlus className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {hasAgent ? 'Start a conversation' : 'Welcome to LLM Chat'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {hasAgent
              ? 'Click the button below or use the sidebar to start a new conversation with your agent.'
              : 'Create an agent from the sidebar to begin chatting with different LLM providers.'}
          </p>
        </div>
        {hasAgent && (
          <Button onClick={handleNewChat} className="gap-2">
            <Plus className="h-4 w-4" />
            New Conversation
          </Button>
        )}
      </div>
    </div>
  )
}
