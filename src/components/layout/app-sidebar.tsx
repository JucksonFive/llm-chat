import { AgentDialog } from '@/components/agents/agent-dialog'
import { SettingsSheet } from '@/components/settings/settings-sheet'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { PROVIDERS } from '@/lib/providers'
import { cn } from '@/lib/utils'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'
import type { ProviderId } from '@/types'
import {
  Brain,
  Gem,
  HardDrive,
  MessageSquarePlus,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Waves,
} from 'lucide-react'
import { useState } from 'react'

const PROVIDER_ICONS: Record<ProviderId, React.ElementType> = {
  openai: Brain,
  anthropic: Sparkles,
  google: Gem,
  ollama: HardDrive,
  deepseek: Waves,
}

export function AppSidebar() {
  const { agents, activeAgentId, setActiveAgent, deleteAgent } = useAgentStore()
  const {
    activeConversationId,
    setActiveConversation,
    createConversation,
    deleteConversation,
    getConversationsForAgent,
  } = useChatStore()
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const conversations = activeAgentId
    ? getConversationsForAgent(activeAgentId)
    : []

  const handleNewChat = async () => {
    if (!activeAgentId) return
    await createConversation(activeAgentId)
  }

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId)
    setAgentDialogOpen(true)
  }

  return (
    <>
      <Sidebar className="border-r border-sidebar-border">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <MessageSquarePlus className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              LLM Chat
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
            {/* Agents */}
            <SidebarGroup>
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-sidebar-foreground/70">Agents</span>
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => {
                    setEditingAgentId(null)
                    setAgentDialogOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <SidebarMenu>
                {agents.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    No agents yet. Create one to start chatting.
                  </p>
                )}
                {agents.map((agent) => {
                  const Icon = PROVIDER_ICONS[agent.providerId]
                  const provider = PROVIDERS[agent.providerId]
                  return (
                    <SidebarMenuItem key={agent.id}>
                      <SidebarMenuButton
                        isActive={agent.id === activeAgentId}
                        onClick={() => setActiveAgent(agent.id)}
                        onDoubleClick={() => handleEditAgent(agent.id)}
                        className="group"
                      >
                        <div
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                          style={{ backgroundColor: provider.color + '20' }}
                        >
                          <Icon
                            className="h-3.5 w-3.5"
                            style={{ color: provider.color }}
                          />
                        </div>
                        <span className="truncate">{agent.name}</span>
                        <div
                          role="button"
                          tabIndex={0}
                          className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteAgent(agent.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              deleteAgent(agent.id)
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>

            <Separator className="my-2" />

            {/* Conversations */}
            {activeAgent && (
              <SidebarGroup>
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-medium text-sidebar-foreground/70">Conversations</span>
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={handleNewChat}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <SidebarMenu>
                  {conversations.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      No conversations yet.
                    </p>
                  )}
                  {conversations.map((conv) => (
                    <SidebarMenuItem key={conv.id}>
                      <SidebarMenuButton
                        isActive={conv.id === activeConversationId}
                        onClick={() => setActiveConversation(conv.id)}
                        className="group"
                      >
                        <span className="truncate text-sm">{conv.title}</span>
                        <div
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent hover:text-accent-foreground',
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteConversation(conv.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              deleteConversation(conv.id)
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            )}
        </SidebarContent>

        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <AgentDialog
        open={agentDialogOpen}
        onOpenChange={setAgentDialogOpen}
        editAgentId={editingAgentId}
      />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
