import { describe, expect, it } from 'vitest'
import {
  applyChatModeToSystemPrompt,
  filterToolsForChatMode,
  permissionProfileForChatMode,
} from './chat-mode'

describe('chat mode', () => {
  it('leaves the system prompt unchanged in chat mode', () => {
    expect(applyChatModeToSystemPrompt('Base prompt', 'chat')).toBe('Base prompt')
  })

  it('adds planning constraints in plan mode', () => {
    const prompt = applyChatModeToSystemPrompt('Base prompt', 'plan')

    expect(prompt).toContain('Base prompt')
    expect(prompt).toContain('Plan mode')
    expect(prompt).toContain('Do not create, edit, move, or delete files')
  })

  it('removes executing and mutating tools in plan mode', () => {
    expect(
      filterToolsForChatMode(
        ['web-search', 'file-reader', 'file-writer', 'code-executor', 'image-generator'],
        'plan',
      ),
    ).toEqual(['web-search', 'file-reader'])
  })

  it('preserves all configured tools in chat mode', () => {
    expect(filterToolsForChatMode(['file-writer', 'code-executor'], 'chat')).toEqual([
      'file-writer',
      'code-executor',
    ])
  })

  it('forces read-only permissions only while planning', () => {
    expect(permissionProfileForChatMode('full-access', 'plan')).toBe('read-only')
    expect(permissionProfileForChatMode('workspace-write', 'chat')).toBe('workspace-write')
  })
})
