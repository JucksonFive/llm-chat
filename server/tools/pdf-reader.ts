import { tool, jsonSchema } from 'ai'
import { readFile, stat } from 'node:fs/promises'
import { auditFileOperation, prepareWorkspacePath } from '../lib/workspace.js'

export const pdfReaderTool = tool({
  description: 'Read and extract text content from a PDF file (restricted to the workspace unless full filesystem access is enabled). Returns the text content of the PDF.',
  inputSchema: jsonSchema<{ path: string; maxPages?: number }>({
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the PDF file (relative to the workspace, or absolute)' },
      maxPages: { type: 'number', description: 'Maximum number of pages to read (default: all)' },
    },
    required: ['path'],
  }),
  execute: async ({ path: filePath }) => {
    const prepared = prepareWorkspacePath(filePath)
    if ('error' in prepared) {
      auditFileOperation('read-pdf', filePath, 'denied', prepared.error)
      return { error: prepared.error }
    }
    const resolved = prepared.resolved

    try {
      const stats = await stat(resolved)
      if (!stats.isFile()) {
        return { error: `"${resolved}" is not a regular file` }
      }
      if (stats.size > 50 * 1024 * 1024) {
        return { error: `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max 50MB)` }
      }

      const buffer = await readFile(resolved)
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const textResult = await parser.getText()
      await parser.destroy()

      let content = textResult.text
      if (content.length > 200000) {
        content = content.slice(0, 200000) + '\n\n[Truncated: content exceeds 200k characters]'
      }

      auditFileOperation('read-pdf', resolved, 'ok')
      return {
        path: resolved,
        pages: textResult.pages.length,
        size: stats.size,
        content,
      }
    } catch (err) {
      auditFileOperation('read-pdf', resolved, 'error', err instanceof Error ? err.message : undefined)
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return { error: `File not found: ${filePath}` }
        if (code === 'EACCES') return { error: `Permission denied: ${filePath}` }
      }
      return { error: err instanceof Error ? err.message : 'Failed to read PDF' }
    }
  },
})
