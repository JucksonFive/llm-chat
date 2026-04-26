// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useApiKeyStore } from './api-key-store'

function reset() {
  localStorage.clear()
  useApiKeyStore.setState({ keys: {} })
}

beforeEach(reset)

describe('useApiKeyStore', () => {
  it('starts with no keys', () => {
    expect(useApiKeyStore.getState().keys).toEqual({})
    expect(useApiKeyStore.getState().getKey('any')).toBe('')
  })

  it('setKey stores and getKey retrieves per agent', () => {
    useApiKeyStore.getState().setKey('agent-1', 'sk-aaa')
    useApiKeyStore.getState().setKey('agent-2', 'sk-bbb')
    expect(useApiKeyStore.getState().getKey('agent-1')).toBe('sk-aaa')
    expect(useApiKeyStore.getState().getKey('agent-2')).toBe('sk-bbb')
    expect(useApiKeyStore.getState().getKey('agent-3')).toBe('')
  })

  it('removeKey deletes only the specified agent', () => {
    useApiKeyStore.getState().setKey('agent-1', 'sk-aaa')
    useApiKeyStore.getState().setKey('agent-2', 'sk-bbb')
    useApiKeyStore.getState().removeKey('agent-1')
    expect(useApiKeyStore.getState().getKey('agent-1')).toBe('')
    expect(useApiKeyStore.getState().getKey('agent-2')).toBe('sk-bbb')
  })

  describe('mergeKeys', () => {
    it('adds incoming keys when local store is empty', () => {
      useApiKeyStore.getState().mergeKeys({ a: 'k1', b: 'k2' })
      expect(useApiKeyStore.getState().keys).toEqual({ a: 'k1', b: 'k2' })
    })

    it('preserves locally edited keys over migrated ones', () => {
      useApiKeyStore.getState().setKey('shared', 'local-value')
      useApiKeyStore.getState().mergeKeys({ shared: 'server-value', new: 'fresh' })
      expect(useApiKeyStore.getState().getKey('shared')).toBe('local-value')
      expect(useApiKeyStore.getState().getKey('new')).toBe('fresh')
    })

    it('is a no-op for empty input', () => {
      useApiKeyStore.getState().setKey('a', 'k1')
      useApiKeyStore.getState().mergeKeys({})
      expect(useApiKeyStore.getState().keys).toEqual({ a: 'k1' })
    })
  })

  describe('findKeyForProvider', () => {
    const agents = [
      { id: 'a1', providerId: 'openai' },
      { id: 'a2', providerId: 'anthropic' },
      { id: 'a3', providerId: 'openai' },
    ]

    it('returns the first agent\'s key matching the provider', () => {
      useApiKeyStore.getState().setKey('a3', 'sk-openai-3')
      expect(useApiKeyStore.getState().findKeyForProvider('openai', agents)).toBe('sk-openai-3')
    })

    it('prefers earlier agents in the list when multiple have keys', () => {
      useApiKeyStore.getState().setKey('a1', 'first')
      useApiKeyStore.getState().setKey('a3', 'third')
      expect(useApiKeyStore.getState().findKeyForProvider('openai', agents)).toBe('first')
    })

    it('returns empty string when no agent has a matching provider', () => {
      useApiKeyStore.getState().setKey('a2', 'sk-anth')
      expect(useApiKeyStore.getState().findKeyForProvider('google', agents)).toBe('')
    })

    it('skips agents whose key is empty', () => {
      useApiKeyStore.getState().setKey('a1', '')
      useApiKeyStore.getState().setKey('a3', 'sk-openai-3')
      expect(useApiKeyStore.getState().findKeyForProvider('openai', agents)).toBe('sk-openai-3')
    })
  })
})
