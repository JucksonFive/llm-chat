import { MessageSquarePlus, Plus, Mic, Paperclip, Search, Brain, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'
import { useProjectStore } from '@/stores/project-store'

interface EmptyStateProps {
  hasAgent: boolean
}

const FEATURES = [
  { icon: Mic, label: 'Voice input', description: 'Talk to your agent' },
  { icon: Paperclip, label: 'File attachments', description: 'Drop images & PDFs' },
  { icon: Search, label: 'Search messages', description: 'Press Ctrl+K' },
  { icon: Brain, label: 'Memory', description: 'Long-term context' },
  { icon: Wrench, label: 'Built-in tools', description: 'Web search, code, more' },
]

export function EmptyState({ hasAgent }: EmptyStateProps) {
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const activeAgent = useAgentStore((s) => s.agents.find((a) => a.id === s.activeAgentId))
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const createConversation = useChatStore((s) => s.createConversation)

  const handleNewChat = async () => {
    if (!activeAgentId) return
    await createConversation(activeAgentId, activeProjectId)
  }

  const enabledTools = activeAgent?.builtInToolIds ?? []

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-2xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
          <MessageSquarePlus className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {hasAgent ? 'Start a conversation' : 'Welcome to LLM Chat'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
            {hasAgent
              ? `Chat with ${activeAgent?.name ?? 'your agent'}. Try one of these features or just start typing.`
              : 'Create an agent from the sidebar to begin chatting with different LLM providers.'}
          </p>
        </div>

        {hasAgent && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-xl">
              {FEATURES.map((feature) => (
                <div
                  key={feature.label}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <feature.icon className="h-5 w-5 text-blue-400" />
                  <div className="text-xs">
                    <div className="font-medium">{feature.label}</div>
                    <div className="text-muted-foreground text-[10px] mt-0.5">{feature.description}</div>
                  </div>
                </div>
              ))}
            </div>

            {enabledTools.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">This agent can use:</span>{' '}
                {enabledTools.map((tool) => tool.replace(/-/g, ' ')).join(', ')}
              </div>
            )}

            <Button onClick={handleNewChat} className="gap-2">
              <Plus className="h-4 w-4" />
              New Conversation
            </Button>

            <p className="text-[11px] text-muted-foreground/70">
              Press <kbd className="px-1.5 py-0.5 rounded border border-border/50 bg-muted/40 text-[10px] font-mono">?</kbd> to see all keyboard shortcuts
            </p>
          </>
        )}
      </div>
    </div>
  )
}
