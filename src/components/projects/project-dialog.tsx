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
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editProjectId: string | null
}

export function ProjectDialog({ open, onOpenChange, editProjectId }: ProjectDialogProps) {
  const { projects, addProject, updateProject, deleteProject } = useProjectStore()
  const editingProject = editProjectId ? projects.find((p) => p.id === editProjectId) : null

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (editingProject) {
      setName(editingProject.name)
      setDescription(editingProject.description)
    } else {
      setName('')
      setDescription('')
    }
  }, [editingProject, open])

  const handleSave = async () => {
    if (!name.trim()) return
    if (editingProject) {
      await updateProject(editingProject.id, {
        name: name.trim(),
        description: description.trim(),
      })
    } else {
      await addProject(name.trim(), description.trim())
    }
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (editingProject) {
      await deleteProject(editingProject.id)
      onOpenChange(false)
    }
  }

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
