import { tool, jsonSchema } from 'ai'
import { readFile, stat } from 'node:fs/promises'
import { auditFileOperation, prepareWorkspacePath } from '../lib/workspace.js'

export const fileReaderTool = tool({
  description: 'Read a file from the local filesystem (restricted to the workspace unless full filesystem access is enabled). Returns the text content of the file.',
  inputSchema: jsonSchema<{ path: string; encoding?: string; maxLines?: number }>({
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to read (relative to the workspace, or absolute)' },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'ascii', 'latin1'],
        description: 'File encoding (default utf-8)',
      },
      maxLines: { type: 'number', description: 'Maximum number of lines to return' },
    },
    required: ['path'],
  }),
  execute: async ({ path: filePath, encoding = 'utf-8', maxLines }) => {
    const prepared = prepareWorkspacePath(filePath)
    if ('error' in prepared) {
      auditFileOperation('read', filePath, 'denied', prepared.error)
      return { error: prepared.error }
    }
    const resolved = prepared.resolved

    try {
      const stats = await stat(resolved)
      if (!stats.isFile()) {
        return { error: `"${resolved}" is not a regular file` }
      }

      if (stats.size > 10 * 1024 * 1024) {
        return { error: `File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max 10MB)` }
      }

      let content = await readFile(resolved, { encoding: encoding as BufferEncoding })

      if (maxLines) {
        const lines = content.split('\n')
        if (lines.length > maxLines) {
          content = lines.slice(0, maxLines).join('\n') + `\n\n[Truncated: showing ${maxLines} of ${lines.length} lines]`
        }
      }

      auditFileOperation('read', resolved, 'ok')
      return {
        path: resolved,
        size: stats.size,
        lines: content.split('\n').length,
        content,
      }
    } catch (err) {
      auditFileOperation('read', resolved, 'error', err instanceof Error ? err.message : undefined)
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return { error: `File not found: ${filePath}` }
        if (code === 'EACCES') return { error: `Permission denied: ${filePath}` }
      }
      return { error: err instanceof Error ? err.message : 'Failed to read file' }
    }
  },
})
