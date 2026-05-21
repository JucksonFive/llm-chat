// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDocumentStore } from './document-store'
import type { IndexedDocument } from '@/types'

const fetchMock = vi.fn()

function reset() {
  useDocumentStore.setState({ documents: [], loaded: false, loading: false })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeDoc(overrides: Partial<IndexedDocument> = {}): IndexedDocument {
  return {
    id: 'd1',
    path: '/tmp/x.txt',
    chunkCount: 3,
    mtime: 1,
    indexedAt: 2,
    ...overrides,
  }
}

describe('loadDocuments', () => {
  it('sets documents and marks loaded=true on success', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ documents: [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })] }),
    })

    await useDocumentStore.getState().loadDocuments()
    const state = useDocumentStore.getState()
    expect(state.loaded).toBe(true)
    expect(state.loading).toBe(false)
    expect(state.documents.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('handles missing documents field by defaulting to []', async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({}) })

    await useDocumentStore.getState().loadDocuments()
    expect(useDocumentStore.getState().documents).toEqual([])
    expect(useDocumentStore.getState().loaded).toBe(true)
  })

  it('clears the loading flag even if fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'))

    await expect(useDocumentStore.getState().loadDocuments()).rejects.toThrow('boom')
    expect(useDocumentStore.getState().loading).toBe(false)
    // loaded stays false because we never reached the success branch.
    expect(useDocumentStore.getState().loaded).toBe(false)
  })
})

describe('deleteDocument', () => {
  it('removes the document on a successful response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true })
    useDocumentStore.setState({
      documents: [makeDoc({ id: 'a' }), makeDoc({ id: 'b' })],
    })

    await useDocumentStore.getState().deleteDocument('a')
    expect(useDocumentStore.getState().documents.map((d) => d.id)).toEqual(['b'])
    expect(fetchMock).toHaveBeenCalledWith('/api/rag/documents/a', { method: 'DELETE' })
  })

  it('throws and leaves state untouched when the API responds with !ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })
    useDocumentStore.setState({
      documents: [makeDoc({ id: 'a' })],
    })

    await expect(useDocumentStore.getState().deleteDocument('a')).rejects.toThrow(/Failed to delete/)
    expect(useDocumentStore.getState().documents.map((d) => d.id)).toEqual(['a'])
  })
})
