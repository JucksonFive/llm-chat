import { tool, jsonSchema } from 'ai'
import { searchDocument } from '../rag/document-index.js'

export function createSearchDocumentTool(apiKey: string) {
  return tool({
    description:
      'Semantically search an already-indexed document for the most relevant passages. Call index_document first to obtain a documentId. Returns the top-K chunks with their page numbers (for PDFs) and similarity scores.',
    inputSchema: jsonSchema<{ documentId: string; query: string; k?: number }>({
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'documentId returned by index_document' },
        query: { type: 'string', description: 'Natural-language question or topic to search for' },
        k: { type: 'number', description: 'Number of chunks to return (default 5, max 20)' },
      },
      required: ['documentId', 'query'],
    }),
    execute: async ({ documentId, query, k }) => {
      try {
        const limit = typeof k === 'number' ? Math.max(1, Math.min(20, k)) : 5
        const result = await searchDocument({ apiKey, documentId, query, k: limit })
        return result
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to search document' }
      }
    },
  })
}
