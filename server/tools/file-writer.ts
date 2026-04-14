import { tool, jsonSchema } from 'ai'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export const fileWriterTool = tool({
  description: 'Write content to a file on the local filesystem. Creates parent directories if they do not exist. Can create new files or overwrite/append to existing ones.',
  inputSchema: jsonSchema<{ path: string; content: string; append?: boolean }>({
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file to write' },
      content: { type: 'string', description: 'The content to write to the file' },
      append: { type: 'boolean', description: 'If true, append to the file instead of overwriting (default false)' },
    },
    required: ['path', 'content'],
  }),
  execute: async ({ path: filePath, content, append = false }) => {
    try {
      const resolved = path.resolve(filePath)

      const contentBytes = Buffer.byteLength(content, 'utf-8')
      if (contentBytes > 10 * 1024 * 1024) {
        return { error: `Content too large: ${(contentBytes / 1024 / 1024).toFixed(1)}MB (max 10MB)` }
      }

      await mkdir(path.dirname(resolved), { recursive: true })

      if (append) {
        const { appendFile } = await import('node:fs/promises')
        await appendFile(resolved, content, 'utf-8')
      } else {
        await writeFile(resolved, content, 'utf-8')
      }

      return {
        path: resolved,
        size: contentBytes,
        mode: append ? 'appended' : 'written',
      }
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EACCES') return { error: `Permission denied: ${filePath}` }
      }
      return { error: err instanceof Error ? err.message : 'Failed to write file' }
    }
  },
})
