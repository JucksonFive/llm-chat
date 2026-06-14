import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-chat-keytest-'))
const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_PASSWORD = process.env.LLM_CHAT_MASTER_PASSWORD
process.env.HOME = TMP_HOME
delete process.env.LLM_CHAT_MASTER_PASSWORD

const { initDb, closeDb, queryOne, run } = await import('./db.js')
const {
  clearAgentApiKey,
  findApiKeyForProvider,
  getAgentApiKey,
  hasAgentApiKey,
  parseAwsCredentials,
  resolveApiKeyForAgent,
  setAgentApiKey,
} = await import('./api-keys.js')

function insertAgent(id: string, providerId = 'openai', createdAt = Date.now()) {
  run(
    `INSERT INTO agents (id, name, provider_id, model, api_key_encrypted, system_prompt, avatar_color, mcp_server_ids, built_in_tool_ids, created_at)
     VALUES ($id, $name, $providerId, $model, '', '', '#6366f1', '[]', '[]', $createdAt)`,
    {
      id,
      name: id,
      providerId,
      model: providerId === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o',
      createdAt,
    },
  )
}

beforeAll(async () => {
  await initDb()
})

beforeEach(() => {
  run('DELETE FROM agents')
})

afterAll(() => {
  closeDb()
  process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_PASSWORD !== undefined) {
    process.env.LLM_CHAT_MASTER_PASSWORD = ORIGINAL_PASSWORD
  }
  fs.rmSync(TMP_HOME, { recursive: true, force: true })
})

describe('agent API key storage', () => {
  it('stores API keys encrypted in SQLite and resolves them decrypted', () => {
    insertAgent('agent-1')

    setAgentApiKey('agent-1', 'sk-secret')

    const row = queryOne<{ api_key_encrypted: string }>(
      'SELECT api_key_encrypted FROM agents WHERE id=$id',
      { id: 'agent-1' },
    )
    expect(row?.api_key_encrypted).toBeTruthy()
    expect(row?.api_key_encrypted).not.toBe('sk-secret')
    expect(row?.api_key_encrypted).not.toContain('sk-secret')
    expect(hasAgentApiKey('agent-1')).toBe(true)
    expect(getAgentApiKey('agent-1')).toBe('sk-secret')
  })

  it('clears stored API keys', () => {
    insertAgent('agent-1')
    setAgentApiKey('agent-1', 'sk-secret')

    clearAgentApiKey('agent-1')

    expect(hasAgentApiKey('agent-1')).toBe(false)
    expect(getAgentApiKey('agent-1')).toBe('')
  })

  it('falls back to the earliest stored key for the requested provider', () => {
    insertAgent('openai-1', 'openai', 1)
    insertAgent('openai-2', 'openai', 2)
    insertAgent('anthropic-1', 'anthropic', 3)
    setAgentApiKey('openai-1', 'sk-first')
    setAgentApiKey('openai-2', 'sk-second')
    setAgentApiKey('anthropic-1', 'sk-anthropic')

    expect(findApiKeyForProvider('openai')).toBe('sk-first')
    expect(resolveApiKeyForAgent('missing-agent', 'anthropic')).toBe('sk-anthropic')
  })

  it('parses stored Bedrock credentials from the encrypted credential value', () => {
    const credentials = {
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret',
      region: 'eu-west-1',
    }

    expect(parseAwsCredentials(JSON.stringify(credentials))).toEqual(credentials)
    expect(parseAwsCredentials('sk-not-json')).toBeUndefined()
  })
})
