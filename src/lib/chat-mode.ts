import type { BuiltInToolId, ChatMode, PermissionProfile } from '@/types'

export const PLAN_MODE_SYSTEM_PROMPT = `

## Plan mode

You are in Plan mode. Produce a clear, implementation-ready plan for the user's request.
You may inspect existing context, read files, and research information needed to make the plan accurate.
Do not create, edit, move, or delete files; do not run commands or tools that can change local or
external state; and do not claim that implementation work has been completed. Resolve details from
available context when possible, and call out only decisions that genuinely require the user.
`

const PLAN_MODE_TOOLS = new Set<BuiltInToolId>([
  'web-fetch',
  'web-search',
  'file-reader',
  'calculator',
  'pdf-reader',
  'datetime',
  'deep-research',
  'search-document',
])

export function applyChatModeToSystemPrompt(systemPrompt: string, mode: ChatMode): string {
  return mode === 'plan' ? systemPrompt + PLAN_MODE_SYSTEM_PROMPT : systemPrompt
}

export function filterToolsForChatMode(
  toolIds: readonly BuiltInToolId[],
  mode: ChatMode,
): BuiltInToolId[] {
  if (mode === 'chat') return [...toolIds]
  return toolIds.filter((toolId) => PLAN_MODE_TOOLS.has(toolId))
}

export function permissionProfileForChatMode(
  permissionProfile: PermissionProfile,
  mode: ChatMode,
): PermissionProfile {
  return mode === 'plan' ? 'read-only' : permissionProfile
}
