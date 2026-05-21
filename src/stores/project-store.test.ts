// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from './project-store'
import type { Project } from '@/types'

const fetchMock = vi.fn()

function reset() {
  localStorage.clear()
  useProjectStore.setState({ projects: [], activeProjectId: null, loaded: false })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'P',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('loadProjects', () => {
  it('loads projects, marks loaded, and clears activeProjectId if it no longer exists', async () => {
    useProjectStore.setState({ activeProjectId: 'gone' })
    fetchMock.mockResolvedValueOnce({
      json: async () => [makeProject({ id: 'a' }), makeProject({ id: 'b' })],
    })

    await useProjectStore.getState().loadProjects()

    expect(useProjectStore.getState().loaded).toBe(true)
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['a', 'b'])
    expect(useProjectStore.getState().activeProjectId).toBeNull()
  })

  it('preserves activeProjectId when it still exists', async () => {
    useProjectStore.setState({ activeProjectId: 'b' })
    fetchMock.mockResolvedValueOnce({
      json: async () => [makeProject({ id: 'a' }), makeProject({ id: 'b' })],
    })

    await useProjectStore.getState().loadProjects()
    expect(useProjectStore.getState().activeProjectId).toBe('b')
  })
})

describe('addProject', () => {
  it('POSTs and prepends the project, marking it active', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ id: 'srv-1' }) })

    const project = await useProjectStore.getState().addProject('My Project', 'desc')

    expect(project.id).toBe('srv-1')
    expect(project.name).toBe('My Project')
    expect(project.description).toBe('desc')
    expect(useProjectStore.getState().projects[0].id).toBe('srv-1')
    expect(useProjectStore.getState().activeProjectId).toBe('srv-1')
  })

  it('defaults description to empty string when omitted', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ id: 'srv-2' }) })
    const project = await useProjectStore.getState().addProject('Only name')
    expect(project.description).toBe('')
  })
})

describe('updateProject', () => {
  it('updates the matching project and bumps updatedAt', async () => {
    fetchMock.mockResolvedValueOnce({})
    useProjectStore.setState({
      projects: [
        makeProject({ id: 'a', name: 'old', updatedAt: 100 }),
        makeProject({ id: 'b', name: 'B', updatedAt: 200 }),
      ],
    })

    await useProjectStore.getState().updateProject('a', { name: 'new' })

    const updated = useProjectStore.getState().projects.find((p) => p.id === 'a')!
    expect(updated.name).toBe('new')
    expect(updated.updatedAt).toBeGreaterThan(100)
    // Other project untouched.
    expect(useProjectStore.getState().projects.find((p) => p.id === 'b')!.updatedAt).toBe(200)
  })

  it('is a no-op when project does not exist', async () => {
    await useProjectStore.getState().updateProject('missing', { name: 'x' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('deleteProject', () => {
  it('removes the project and clears active when deleting active project', async () => {
    fetchMock.mockResolvedValueOnce({})
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' })],
      activeProjectId: 'a',
    })

    await useProjectStore.getState().deleteProject('a')

    expect(useProjectStore.getState().projects).toEqual([])
    expect(useProjectStore.getState().activeProjectId).toBeNull()
  })

  it('preserves active when deleting a non-active project', async () => {
    fetchMock.mockResolvedValueOnce({})
    useProjectStore.setState({
      projects: [makeProject({ id: 'a' }), makeProject({ id: 'b' })],
      activeProjectId: 'a',
    })

    await useProjectStore.getState().deleteProject('b')
    expect(useProjectStore.getState().activeProjectId).toBe('a')
  })
})

describe('setActiveProject', () => {
  it('sets and clears the active id', () => {
    useProjectStore.getState().setActiveProject('xyz')
    expect(useProjectStore.getState().activeProjectId).toBe('xyz')
    useProjectStore.getState().setActiveProject(null)
    expect(useProjectStore.getState().activeProjectId).toBeNull()
  })
})
