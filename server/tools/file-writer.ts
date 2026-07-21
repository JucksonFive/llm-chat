import { tool, jsonSchema } from 'ai'
import type { Tool } from 'ai'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { auditFileOperation, prepareWorkspacePath } from '../lib/workspace.js'
import { logSecurityEvent } from '../lib/audit-log.js'
import { loadProjectWorkspace } from '../lib/sandbox-service.js'

export interface FileWriterOptions {
  /** The active project ID (injected, not exposed to the LLM). If provided,
   *  the project's workspace path is used as the filesystem boundary. */
  projectId?: string
  /** Permission profile. 'read-only' disables writes entirely. */
  permissionProfile?: string
}

/**
 * Create a file writer tool scoped to the given project context.
 * When no projectId is provided, falls back to the global WORKSPACE_ROOT.
 * When permissionProfile is 'read-only', all writes are denied.
 */
export function createFileWriterTool(options: FileWriterOptions = {}): Tool {
  const { projectId, permissionProfile } = options

  // Resolve workspace root from project if available
  const workspaceRoot = projectId
    ? loadProjectWorkspace(projectId)?.workspacePath
    : undefined

  return tool({
    description: 'Write content to a file on the local filesystem (restricted to the workspace unless full filesystem access is enabled). Creates parent directories if they do not exist. Can create new files or overwrite/append to existing ones.',
    inputSchema: jsonSchema<{ path: string; content: string; append?: boolean }>({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to write (relative to the workspace, or absolute)' },
        content: { type: 'string', description: 'The content to write to the file' },
        append: { type: 'boolean', description: 'If true, append to the file instead of overwriting (default false)' },
      },
      required: ['path', 'content'],
    }),
    execute: async ({ path: filePath, content, append = false }) => {
      // Respect read-only permission profile
      if (permissionProfile === 'read-only') {
        auditFileOperation(append ? 'append' : 'write', filePath, 'denied', 'Permission profile is read-only')
        return { error: 'Write access denied: current permission profile is set to read-only.' }
      }

      const prepared = prepareWorkspacePath(filePath, workspaceRoot)
      if ('error' in prepared) {
        auditFileOperation(append ? 'append' : 'write', filePath, 'denied', prepared.error)
        return { error: prepared.error }
      }
      const resolved = prepared.resolved

      try {
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

        auditFileOperation(append ? 'append' : 'write', resolved, 'ok', `${contentBytes} bytes`)
        logSecurityEvent('file.write', {
          path: resolved,
          size: contentBytes,
          operation: append ? 'append' : 'overwrite',
          success: true,
          projectId: projectId ?? null,
        })

        return {
          path: resolved,
          size: contentBytes,
          mode: append ? 'appended' : 'written',
        }
      } catch (err) {
        auditFileOperation(append ? 'append' : 'write', resolved, 'error', err instanceof Error ? err.message : undefined)
        logSecurityEvent(
          'file.write',
          {
            path: filePath,
            operation: append ? 'append' : 'overwrite',
            success: false,
            error: err instanceof Error ? err.message : 'unknown',
          },
          'warning',
        )
        if (err instanceof Error && 'code' in err) {
          const code = (err as NodeJS.ErrnoException).code
          if (code === 'EACCES') return { error: `Permission denied: ${filePath}` }
        }
        return { error: err instanceof Error ? err.message : 'Failed to write file' }
      }
    },
  })
}

// Static backward-compatible instance
export const fileWriterTool = createFileWriterTool()

