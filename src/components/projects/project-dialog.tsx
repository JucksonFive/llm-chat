import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useProjectStore } from '@/stores/project-store'
import { Folder, Trash2, Monitor, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WorkspaceKind, PreferredRuntime } from '@/types'

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editProjectId: string | null
}

export function ProjectDialog({ open, onOpenChange, editProjectId }: ProjectDialogProps) {
  const { projects, addProject, updateProject, deleteProject } = useProjectStore()
  const editingProject = editProjectId ? projects.find((p) => p.id === editProjectId) : null

  const [name, setName] = useState(editingProject?.name ?? '')
  const [description, setDescription] = useState(editingProject?.description ?? '')
  const [workspacePath, setWorkspacePath] = useState(editingProject?.workspacePath ?? '')
  const [workspaceKind, setWorkspaceKind] = useState<WorkspaceKind | ''>(editingProject?.workspaceKind ?? '')
  const [preferredRuntime, setPreferredRuntime] = useState<PreferredRuntime | ''>(editingProject?.preferredRuntime ?? '')
  const [selectingFolder, setSelectingFolder] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editingProject?.name ?? '')
    setDescription(editingProject?.description ?? '')
    setWorkspacePath(editingProject?.workspacePath ?? '')
    setWorkspaceKind(editingProject?.workspaceKind ?? '')
    setPreferredRuntime(editingProject?.preferredRuntime ?? '')
  }, [open, editProjectId, editingProject])
  const handleSelectFolder = async () => {
    setSelectingFolder(true)
    try {
      const result = await window.electronAPI?.selectWorkspaceFolder()
      if (result) {
        setWorkspacePath(result.path)
        // Auto-detect workspace kind from path
        if (
          !workspaceKind &&
          (result.path.startsWith('/mnt/') || result.path.startsWith('\\\\wsl'))
        ) {
          setWorkspaceKind('wsl')
          setPreferredRuntime('wsl-pwsh')
        } else if (!workspaceKind) {
          setWorkspaceKind('windows')
          setPreferredRuntime('windows-powershell')
        }
      }
    } catch (err) {
      console.error('Folder selection failed:', err)
    } finally {
      setSelectingFolder(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    if (editingProject) {
      await updateProject(editingProject.id, {
        name: name.trim(),
        description: description.trim(),
        workspacePath,
        workspaceKind,
        preferredRuntime,
      })
    } else {
      await addProject(name.trim(), description.trim(), {
        workspacePath,
        workspaceKind,
        preferredRuntime,
      })
    }
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (editingProject) {
      await deleteProject(editingProject.id)
      onOpenChange(false)
    }
  }

  const isElectron = window.electronAPI?.isElectron

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingProject ? 'Edit Project' : 'Create Project'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="min-h-[80px]"
            />
          </div>

          {/* Workspace configuration */}
          <div className="grid gap-3 border-t border-border/50 pt-4">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Workspace
            </Label>

            {/* Folder picker */}
            <div className="grid gap-2">
              <Label htmlFor="workspace-path" className="text-xs">Project Folder</Label>
              <div className="flex gap-2">
                <Input
                  id="workspace-path"
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  placeholder={isElectron ? 'Click button to select...' : 'Enter workspace path...'}
                  className="flex-1 text-sm"
                  readOnly={!!isElectron}
                />
                {isElectron && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSelectFolder}
                    disabled={selectingFolder}
                    title="Select workspace folder"
                  >
                    <Folder className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {isElectron && (
                <p className="text-[10px] text-muted-foreground">
                  Select a folder using the native dialog. Path is validated before saving.
                </p>
              )}
              {!isElectron && (
                <p className="text-[10px] text-amber-500">
                  Running in browser mode — enter path manually (workspace tools only available in Electron).
                </p>
              )}
            </div>

            {/* Workspace kind */}
            {workspacePath && (
              <>
                <div className="grid gap-2">
                  <Label className="text-xs">Environment</Label>
                  <div className="flex gap-1">
                    <Button
                      variant={workspaceKind === 'windows' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setWorkspaceKind('windows')
                        setPreferredRuntime('windows-powershell')
                      }}
                    >
                      <Monitor className="h-3.5 w-3.5 mr-1" />
                      Windows
                    </Button>
                    <Button
                      variant={workspaceKind === 'wsl' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setWorkspaceKind('wsl')
                        setPreferredRuntime('wsl-pwsh')
                      }}
                    >
                      <Terminal className="h-3.5 w-3.5 mr-1" />
                      WSL
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {editingProject && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="mr-auto"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingProject ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
