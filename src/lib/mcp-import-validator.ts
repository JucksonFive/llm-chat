import type { McpServerImport } from '@/types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateMcpImport(config: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[]= []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Invalid configuration format'], warnings: [] }
  }

  const server = config as Partial<McpServerImport>

  // Required fields
  if (!server.name || typeof server.name !== 'string' || !server.name.trim()) {
    errors.push('Server name is required')
  }

  if (!server.transport) {
    errors.push('Transport type is required')
  } else if (!['stdio', 'sse', 'streamable-http'].includes(server.transport)) {
    errors.push(`Invalid transport type: ${server.transport}. Must be stdio, sse, or streamable-http`)
  }

  // Transport-specific validation
  if (server.transport === 'stdio') {
    if (!server.command || typeof server.command !== 'string' || !server.command.trim()) {
      errors.push('Command is required for stdio transport')
    }
    if (server.url) {
      warnings.push('URL field is ignored for stdio transport')
    }
  } else if (server.transport === 'sse' || server.transport === 'streamable-http') {
    if (!server.url || typeof server.url !== 'string' || !server.url.trim()) {
      errors.push(`URL is required for ${server.transport} transport`)
    }
    if (server.command) {
      warnings.push('Command field is ignored for remote transports')
    }
    if (server.args) {
      warnings.push('Args field is ignored for remote transports')
    }
  }

  // Optional field validation
  if (server.args !== undefined && !Array.isArray(server.args)) {
    errors.push('Args must be an array')
  }

  if (server.env !== undefined) {
    if (typeof server.env !== 'object' || Array.isArray(server.env)) {
      errors.push('Env must be an object')
    }
  }

  if (server.envPlaceholders !== undefined) {
    if (!Array.isArray(server.envPlaceholders)) {
      errors.push('envPlaceholders must be an array')
    } else {
      server.envPlaceholders.forEach((placeholder, idx) => {
        if (!placeholder.key || typeof placeholder.key !== 'string') {
          errors.push(`envPlaceholder[${idx}] missing valid key`)
        }
        if (!placeholder.label || typeof placeholder.label !== 'string') {
          errors.push(`envPlaceholder[${idx}] missing valid label`)
        }
      })
    }
  }

  // Security warnings
  if (server.url && server.url.startsWith('http://')) {
    warnings.push('HTTP URLs are not secure. Consider using HTTPS')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

export function parseImportPayload(data: unknown): { servers: McpServerImport[]; error?: string } {
  if (Array.isArray(data)) {
    return { servers: data as McpServerImport[] }
  }

  if (data && typeof data === 'object') {
    return { servers: [data as McpServerImport] }
  }

  return { servers: [], error: 'Invalid format: expected object or array' }
}
