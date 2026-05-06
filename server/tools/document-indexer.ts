import { tool, jsonSchema } from 'ai'
import { indexDocument } from '../rag/document-index.js'

export function createIndexDocumentTool(apiKey: string) {
  return tool({
    description:
      'Load a document (PDF or text), split it into chunks, embed them, and store them for semantic search. Returns a documentId you must pass to search_document. Use this for large files instead of pdf-reader / file-reader. Re-running on an unchanged file is a fast no-op.',
    inputSchema: jsonSchema<{ path: string }>({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the document (.pdf or text file)' },
      },
      required: ['path'],
    }),
    execute: async ({ path: filePath }) => {
      try {
        const result = await indexDocument({ apiKey, path: filePath })
        return result
      } catch (err) {
        if (err instanceof Error && 'code' in err) {
          const code = (err as NodeJS.ErrnoException).code
          if (code === 'ENOENT') return { error: `File not found: ${filePath}` }
          if (code === 'EACCES') return { error: `Permission denied: ${filePath}` }
        }
        return { error: err instanceof Error ? err.message : 'Failed to index document' }
      }
    },
  })
}
