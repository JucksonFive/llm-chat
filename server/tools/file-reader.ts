import { tool, jsonSchema } from 'ai'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const fileReaderTool = tool({
  description: 'Read a file from the local filesystem. Returns the text content of the file.',
  inputSchema: jsonSchema<{ path: string; encoding?: string; maxLines?: number }>({
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file to read' },
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
    try {
      const resolved = path.resolve(filePath)

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

      return {
        path: resolved,
        size: stats.size,
        lines: content.split('\n').length,
        content,
      }
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return { error: `File not found: ${filePath}` }
        if (code === 'EACCES') return { error: `Permission denied: ${filePath}` }
      }
      return { error: err instanceof Error ? err.message : 'Failed to read file' }
    }
  },
})
