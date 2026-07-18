import { useMemo, useState } from 'react'
import type { ElementType } from 'react'
import { AgentDialog } from '@/components/agents/agent-dialog'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { SettingsSheet } from '@/components/settings/settings-sheet'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PROVIDERS } from '@/lib/providers'
import { cn } from '@/lib/utils'
import { useAgentStore } from '@/stores/agent-store'
import { useChatStore } from '@/stores/chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useConversationSearch } from '@/hooks/use-message-search'
import type { Conversation, ProviderId } from '@/types'
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Ellipsis,
  Folder,
  Gem,
  HardDrive,
  MessageSquarePlus,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Waves,
  X,
} from 'lucide-react'

const PROVIDER_ICONS: Record<ProviderId, ElementType> = {
  openai: Brain,
  anthropic: Sparkles,
  google: Gem,
  ollama: HardDrive,
  deepseek: Waves,
  kimi: Moon,
  bedrock: Cloud,
}

const THREAD_LIMIT = 5
const PROJECT_LIMIT = 6

interface ConversationRowProps {
  conversation: Conversation
  active: boolean
  onSelect: () => void
  onDelete: () => void
}

function ConversationRow({ conversation, active, onSelect, onDelete }: ConversationRowProps) {
  return (
    <div className="group/thread relative flex min-w-0 items-center">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex h-7 min-w-0 flex-1 items-center rounded-lg px-2 text-left text-[13px] transition-colors',
          active
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        )}
      >
        <span className="truncate">{conversation.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent group-hover/thread:opacity-100 focus:opacity-100"
            aria-label={`Conversation actions for ${conversation.title}`}
          >
            <Ellipsis className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-40">
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function AppSidebar() {
  const { agents, activeAgentId, setActiveAgent, deleteAgent } = useAgentStore()
  const agentsLoaded = useAgentStore((state) => state.loaded)
  const conversationMap = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore((state) => state.activeConversationId)
  const conversationsLoaded = useChatStore((state) => state.loaded)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const createConversation = useChatStore((state) => state.createConversation)
  const deleteConversation = useChatStore((state) => state.deleteConversation)
  const { projects, activeProjectId, setActiveProject, deleteProject } = useProjectStore()
  const { query, setQuery, filteredConversations, matchCount } = useConversationSearch(
    activeAgentId || undefined,
  )
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(new Set())
  const [expandedThreadGroups, setExpandedThreadGroups] = useState<Set<string>>(new Set())

  const activeAgent = agents.find((agent) => agent.id === activeAgentId)
  const activeProvider = activeAgent ? PROVIDERS[activeAgent.providerId] : null

  const agentConversations = useMemo(
    () => Object.values(conversationMap)
      .filter((conversation) => conversation.agentId === activeAgentId)
      .sort((left, right) => right.updatedAt - left.updatedAt),
    [activeAgentId, conversationMap],
  )

  const conversationsByProject = useMemo(() => {
    const grouped = new Map<string | null, Conversation[]>()
    for (const conversation of agentConversations) {
      const key = conversation.projectId ?? null
      const current = grouped.get(key) ?? []
      current.push(conversation)
      grouped.set(key, current)
    }
    return grouped
  }, [agentConversations])

  const handleNewChat = async (projectId: string | null = activeProjectId) => {
    if (!activeAgentId) return
    setActiveProject(projectId)
    await createConversation(activeAgentId, projectId)
  }

  const selectAgent = (agentId: string) => {
    setActiveAgent(agentId)
    setActiveConversation(null)
  }

  const selectConversation = (conversation: Conversation) => {
    setActiveProject(conversation.projectId)
    setActiveConversation(conversation.id)
  }

  const toggleProject = (projectId: string) => {
    setCollapsedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const toggleThreadGroup = (groupId: string) => {
    setExpandedThreadGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const openNewAgent = () => {
    setEditingAgentId(null)
    setAgentDialogOpen(true)
  }

  const openActiveAgent = () => {
    if (!activeAgent) return openNewAgent()
    setEditingAgentId(activeAgent.id)
    setAgentDialogOpen(true)
  }

  const openNewProject = () => {
    setEditingProjectId(null)
    setProjectDialogOpen(true)
  }

  const openProject = (projectId: string) => {
    setEditingProjectId(projectId)
    setProjectDialogOpen(true)
  }

  const renderConversationList = (groupId: string, conversations: Conversation[]) => {
    if (conversations.length === 0) return null
    const showAll = expandedThreadGroups.has(groupId)
    const visibleConversations = showAll
      ? conversations
      : conversations.slice(0, THREAD_LIMIT)

    return (
      <div className="ml-6 space-y-0.5 py-0.5">
        {visibleConversations.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === activeConversationId}
            onSelect={() => selectConversation(conversation)}
            onDelete={() => void deleteConversation(conversation.id)}
          />
        ))}
        {conversations.length > THREAD_LIMIT && (
          <button
            type="button"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-sidebar-foreground"
            onClick={() => toggleThreadGroup(groupId)}
          >
            {showAll ? 'Show less' : `Show ${conversations.length - THREAD_LIMIT} more`}
          </button>
        )}
      </div>
    )
  }

  const visibleProjects = showAllProjects ? projects : projects.slice(0, PROJECT_LIMIT)
  const unassignedConversations = conversationsByProject.get(null) ?? []

  return (
    <>
      <Sidebar className="border-r border-sidebar-border">
        <SidebarHeader className="gap-1.5 p-2">
          <div className="flex h-9 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 text-sm font-semibold hover:bg-sidebar-accent"
                >
                  <span className="truncate">LLM Chat</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Agents</DropdownMenuLabel>
                {!agentsLoaded && <Skeleton className="mx-2 my-1 h-8" />}
                {agents.map((agent) => {
                  const Icon = PROVIDER_ICONS[agent.providerId]
                  const provider = PROVIDERS[agent.providerId]
                  return (
                    <DropdownMenuItem key={agent.id} onSelect={() => selectAgent(agent.id)}>
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${provider.color}20` }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: provider.color }} />
                      </div>
                      <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                      {agent.id === activeAgentId && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                  )
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={openNewAgent}>
                  <Plus className="h-4 w-4" />
                  New agent
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openActiveAgent} disabled={!activeAgent}>
                  <Pencil className="h-4 w-4" />
                  Edit active agent
                </DropdownMenuItem>
                {activeAgent && agents.length > 1 && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => {
                      setActiveConversation(null)
                      void deleteAgent(activeAgent.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete active agent
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                searchOpen && 'bg-sidebar-accent text-sidebar-foreground',
              )}
              onClick={() => {
                setSearchOpen((open) => !open)
                if (searchOpen) setQuery('')
              }}
              aria-label={searchOpen ? 'Close chat search' : 'Search chats'}
            >
              {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
          </div>

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => void handleNewChat()}
                disabled={!activeAgentId}
                className="h-9 rounded-lg"
              >
                <MessageSquarePlus className="h-4 w-4" />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {searchOpen && (
            <div className="relative px-1 pb-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search chats"
                className="h-8 rounded-lg pl-8 text-xs"
              />
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="px-2 pb-2">
          {query.trim() ? (
            <div className="py-2">
              <div className="flex h-7 items-center px-2 text-xs text-muted-foreground">
                Search results · {matchCount}
              </div>
              <div className="space-y-0.5">
                {filteredConversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onSelect={() => selectConversation(conversation)}
                    onDelete={() => void deleteConversation(conversation.id)}
                  />
                ))}
                {matchCount === 0 && (
                  <p className="px-2 py-3 text-xs text-muted-foreground">No matching chats</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1 py-1">
                {visibleProjects.map((project) => {
                  const projectConversations = conversationsByProject.get(project.id) ?? []
                  const expanded = !collapsedProjectIds.has(project.id)
                  return (
                    <div key={project.id}>
                      <div
                        className={cn(
                          'group/project flex h-8 items-center rounded-lg px-1 transition-colors',
                          project.id === activeProjectId
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'hover:bg-sidebar-accent/70',
                        )}
                      >
                        <button
                          type="button"
                          className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground"
                          onClick={() => toggleProject(project.id)}
                          aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
                        >
                          <ChevronRight
                            className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
                          />
                        </button>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] font-medium"
                          onClick={() => {
                            setActiveProject(project.id)
                            if (!expanded) toggleProject(project.id)
                          }}
                        >
                          <Folder className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{project.name}</span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-sidebar-accent group-hover/project:opacity-100 focus:opacity-100"
                              aria-label={`Project actions for ${project.name}`}
                            >
                              <Ellipsis className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start" className="w-44">
                            <DropdownMenuItem onSelect={() => void handleNewChat(project.id)}>
                              <MessageSquarePlus className="h-4 w-4" />
                              New chat
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openProject(project.id)}>
                              <Pencil className="h-4 w-4" />
                              Edit project
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => void deleteProject(project.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {expanded && renderConversationList(`project:${project.id}`, projectConversations)}
                    </div>
                  )
                })}

                {projects.length > PROJECT_LIMIT && (
                  <button
                    type="button"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-sidebar-foreground"
                    onClick={() => setShowAllProjects((showAll) => !showAll)}
                  >
                    {showAllProjects ? 'Show less' : `Show ${projects.length - PROJECT_LIMIT} more projects`}
                  </button>
                )}

                {!conversationsLoaded && (
                  <div className="space-y-1 px-2 py-2">
                    <Skeleton className="h-7 w-full" />
                    <Skeleton className="h-7 w-4/5" />
                  </div>
                )}

                <button
                  type="button"
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  onClick={openNewProject}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add project
                </button>
              </div>

              <div className="mt-2">
                <div className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground">
                  Chats
                </div>
                {renderConversationList('unassigned', unassignedConversations)}
                {conversationsLoaded && unassignedConversations.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground/70">No chats</p>
                )}
              </div>
            </>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setSettingsOpen(true)}
                className="h-11 rounded-lg"
                aria-label="Open settings"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: activeAgent?.avatarColor ?? '#64748b' }}
                >
                  {activeAgent?.name?.charAt(0).toUpperCase() ?? 'L'}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-xs font-medium">
                    {activeAgent?.name ?? 'LLM Chat'}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {activeProvider?.name ?? 'Settings'}
                  </span>
                </div>
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
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
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        editProjectId={editingProjectId}
      />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
