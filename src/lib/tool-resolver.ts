import type { BuiltInToolId, Message } from '@/types'
import { useDocumentStore } from '@/stores/document-store'

export interface ToolContext {
  hasUploadedPdf: boolean
  hasIndexedDocument: boolean
  workspaceAccessEnabled: boolean
}

export interface ToolSettings {
  manuallyEnabledTools: readonly BuiltInToolId[]
  manuallyDisabledTools: readonly BuiltInToolId[]
}

const DEFAULT_ENABLED_TOOLS: BuiltInToolId[] = [
  'web-fetch',
  'web-search',
  'calculator',
  'datetime',
]

/**
 * Compute the tool context from the current conversation state.
 */
export function computeToolContext(messages: Message[]): ToolContext {
  const hasUploadedPdf = messages.some(
    (msg) => msg.attachments?.some((att) => att.type === 'pdf')
  )

  const hasIndexedDocument = useDocumentStore.getState().documents.length > 0

  // For now, workspace access is not implemented — default to false
  const workspaceAccessEnabled = false

  return {
    hasUploadedPdf,
    hasIndexedDocument,
    workspaceAccessEnabled,
  }
}

/**
 * Determine which tools should be available based on agent settings and context.
 *
 * Strategy:
 * - If agentToolIds is empty → use all default-enabled tools
 * - If agentToolIds is non-empty → it's the user's explicit choice of which tools to enable
 * - Conditional tools (pdf-reader, search-document) are added on top whenever their
 *   context is met, so the agent can read an uploaded PDF or query an indexed document
 *   even if the user never enabled those tools manually.
 *
 * This means:
 * - Empty agentToolIds = defaults + conditionals
 * - Non-empty agentToolIds = user's selection + conditionals
 */
export function resolveAvailableTools(
  agentToolIds: readonly BuiltInToolId[],
  context: ToolContext
): BuiltInToolId[] {
  const availableIds: Set<BuiltInToolId> = new Set()

  if (agentToolIds.length === 0) {
    // No explicit selection → use defaults
    for (const id of DEFAULT_ENABLED_TOOLS) {
      availableIds.add(id)
    }
  } else {
    // User made explicit selection → use their choices
    for (const id of agentToolIds) {
      availableIds.add(id)
    }
  }

  // Always add conditional tools when context permits
  // These are added on top of the base selection (defaults or explicit)
  if (context.hasUploadedPdf) {
    availableIds.add('pdf-reader')
  }
  if (context.hasIndexedDocument) {
    availableIds.add('search-document')
  }

  return Array.from(availableIds)
}
