import { useState } from 'react'
import { Check, ChevronDown, FolderCog, FolderOpen, Plus, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { SandboxStatus } from '@/components/sandbox/sandbox-status'
import { useProjectStore } from '@/stores/project-store'
import { useUIStore } from '@/stores/ui-store'
import type { PermissionProfile } from '@/types'
import { cn } from '@/lib/utils'

const PROFILES: { value: PermissionProfile; label: string; description: string; icon: typeof Shield; color: string }[] = [
  { value: 'workspace-write', label: 'Workspace write', description: 'Read and write inside the selected workspace', icon: ShieldCheck, color: 'text-emerald-500' },
  { value: 'read-only', label: 'Read only', description: 'Read workspace files without modifying them', icon: Shield, color: 'text-amber-500' },
  { value: 'full-access', label: 'Full access', description: 'Allow filesystem and network access', icon: ShieldAlert, color: 'text-red-500' },
]

export function WorkspaceMenu() {
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const permissionProfile = useUIStore((s) => s.permissionProfile)
  const setPermissionProfile = useUIStore((s) => s.setPermissionProfile)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId)
  const activeProfile = PROFILES.find((profile) => profile.value === permissionProfile) ?? PROFILES[0]
  const ProfileIcon = activeProfile.icon

  const openNewWorkspace = () => {
    setEditingProjectId(null)
    setProjectDialogOpen(true)
  }

  const openWorkspaceSettings = () => {
    if (!activeProject) return openNewWorkspace()
    setEditingProjectId(activeProject.id)
    setProjectDialogOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={cn('h-7 max-w-[320px] gap-1.5 px-2 text-xs', activeProfile.color)} aria-label="Open workspace and permission settings">
            <ProfileIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{activeProject?.name ?? 'Workspace'}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[340px] max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Active workspace</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setActiveProject(null)}>
            <FolderOpen className="h-4 w-4" />
            <div className="min-w-0 flex-1"><p className="text-sm">No workspace</p><p className="text-[10px] text-muted-foreground">Chat without local project access</p></div>
            {!activeProjectId && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
          {projects.map((project) => (
            <DropdownMenuItem key={project.id} onSelect={() => setActiveProject(project.id)}>
              <FolderOpen className="h-4 w-4" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{project.name}</p>
                <p className="truncate text-[10px] text-muted-foreground" title={project.workspacePath || 'No folder configured'}>{project.workspacePath || 'No folder configured'}</p>
              </div>
              {project.id === activeProjectId && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openNewWorkspace}><Plus className="h-4 w-4" />Add workspace</DropdownMenuItem>
          <DropdownMenuItem onSelect={openWorkspaceSettings}><FolderCog className="h-4 w-4" />{activeProject ? 'Edit workspace path' : 'Configure workspace'}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Permissions</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={permissionProfile} onValueChange={(value) => setPermissionProfile(value as PermissionProfile)}>
            {PROFILES.map((profile) => {
              const Icon = profile.icon
              return (
                <DropdownMenuRadioItem key={profile.value} value={profile.value}>
                  <Icon className={cn('h-4 w-4', profile.color)} />
                  <div className="min-w-0"><p className="text-sm">{profile.label}</p><p className="text-[10px] text-muted-foreground">{profile.description}</p></div>
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5"><SandboxStatus /></div>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectDialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen} editProjectId={editingProjectId} />
    </>
  )
}