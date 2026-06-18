import { describe, expect, it } from 'vitest'
import { sanitizeEnv, SAFE_ENV_KEYS, DENY_PATTERNS } from './mcp-manager.js'

describe('sanitizeEnv', () => {
  it('passes through safe allowlisted env vars', () => {
    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      LANG: 'en_US.UTF-8',
      NODE_ENV: 'production',
    }
    const result = sanitizeEnv(env)
    expect(result.PATH).toBe('/usr/bin')
    expect(result.HOME).toBe('/home/user')
    expect(result.LANG).toBe('en_US.UTF-8')
    expect(result.NODE_ENV).toBe('production')
  })

  it('strips application secrets (API keys, AWS_*, LLM_CHAT_*)', () => {
    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-secret',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      GOOGLE_API_KEY: 'g-secret',
      DEEPSEEK_API_KEY: 'ds-secret',
      AWS_ACCESS_KEY_ID: 'AKIA...',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_PROFILE: 'default',
      AWS_REGION: 'us-east-1',
      LLM_CHAT_MASTER_PASSWORD: 'hunter2',
      SOME_TOKEN: 'tok',
      DB_PASSWORD: 'pw',
      MY_CREDENTIALS: 'creds',
    }
    const result = sanitizeEnv(env)
    expect(result.PATH).toBe('/usr/bin')
    expect(result.OPENAI_API_KEY).toBeUndefined()
    expect(result.ANTHROPIC_API_KEY).toBeUndefined()
    expect(result.GOOGLE_API_KEY).toBeUndefined()
    expect(result.DEEPSEEK_API_KEY).toBeUndefined()
    expect(result.AWS_ACCESS_KEY_ID).toBeUndefined()
    expect(result.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(result.AWS_PROFILE).toBeUndefined()
    expect(result.AWS_REGION).toBeUndefined()
    expect(result.LLM_CHAT_MASTER_PASSWORD).toBeUndefined()
    expect(result.SOME_TOKEN).toBeUndefined()
    expect(result.DB_PASSWORD).toBeUndefined()
    expect(result.MY_CREDENTIALS).toBeUndefined()
  })

  it('does not forward arbitrary non-allowlisted vars even if not secret', () => {
    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      RANDOM_APP_VAR: 'value',
    }
    const result = sanitizeEnv(env)
    expect(result.PATH).toBe('/usr/bin')
    expect(result.RANDOM_APP_VAR).toBeUndefined()
  })

  it('ignores undefined values', () => {
    const env: NodeJS.ProcessEnv = { PATH: undefined }
    const result = sanitizeEnv(env)
    expect('PATH' in result).toBe(false)
  })

  it('lets config.env override safe defaults', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', NODE_ENV: 'production' }
    const result = sanitizeEnv(env, { PATH: '/custom/bin', NODE_ENV: 'development' })
    expect(result.PATH).toBe('/custom/bin')
    expect(result.NODE_ENV).toBe('development')
  })

  it('lets config.env pass through vars that would otherwise be denied or non-allowlisted', () => {
    // User intentionally sets an API token their MCP server needs.
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin' }
    const result = sanitizeEnv(env, {
      GITHUB_API_KEY: 'user-provided-key',
      CUSTOM_VAR: 'on',
    })
    expect(result.GITHUB_API_KEY).toBe('user-provided-key')
    expect(result.CUSTOM_VAR).toBe('on')
    expect(result.PATH).toBe('/usr/bin')
  })

  it('config.env does not leak process secrets — only what the user set', () => {
    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-secret',
    }
    const result = sanitizeEnv(env, { CUSTOM_VAR: 'on' })
    expect(result.OPENAI_API_KEY).toBeUndefined()
    expect(result.CUSTOM_VAR).toBe('on')
  })

  it('exports a non-empty allowlist and deny-list', () => {
    expect(SAFE_ENV_KEYS.length).toBeGreaterThan(0)
    expect(DENY_PATTERNS.length).toBeGreaterThan(0)
  })
})
