import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project } from '@/types'

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  loaded: boolean
  loadProjects: () => Promise<void>
  addProject: (name: string, description?: string) => Promise<Project>
  updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'description'>>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      loaded: false,

      loadProjects: async () => {
        const res = await fetch('/api/db/projects')
        const projects: Project[] = await res.json()
        const persistedId = get().activeProjectId
        const activeProjectId = persistedId && projects.some((p) => p.id === persistedId)
          ? persistedId
          : null
        set({ projects, activeProjectId, loaded: true })
      },

      addProject: async (name, description) => {
        const res = await fetch('/api/db/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        })
        const { id } = await res.json()
        const project: Project = {
          id,
          name,
          description: description || '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((state) => ({
          projects: [project, ...state.projects],
          activeProjectId: project.id,
        }))
        return project
      },

      updateProject: async (id, updates) => {
        const project = get().projects.find((p) => p.id === id)
        if (!project) return
        const merged = { ...project, ...updates }
        await fetch(`/api/db/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: merged.name, description: merged.description }),
        })
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        }))
      },

      deleteProject: async (id) => {
        await fetch(`/api/db/projects/${id}`, { method: 'DELETE' })
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }))
      },

      setActiveProject: (id) => set({ activeProjectId: id }),
    }),
    {
      name: 'llm-chat-projects',
      partialize: (state) => ({ activeProjectId: state.activeProjectId }),
    }
  )
)
