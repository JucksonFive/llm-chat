import { create } from 'zustand'
import type { IndexedDocument } from '@/types'
import { apiFetch } from '@/lib/api-fetch'

interface DocumentState {
  documents: IndexedDocument[]
  loaded: boolean
  loading: boolean
  loadDocuments: () => Promise<void>
  deleteDocument: (id: string) => Promise<void>
}

export const useDocumentStore = create<DocumentState>()((set) => ({
  documents: [],
  loaded: false,
  loading: false,

  loadDocuments: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/rag/documents')
      const data = (await res.json()) as { documents: IndexedDocument[] }
      set({ documents: data.documents ?? [], loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  deleteDocument: async (id) => {
    const res = await apiFetch(`/api/rag/documents/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete document')
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }))
  },
}))
