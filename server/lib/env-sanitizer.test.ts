import { describe, expect, it } from 'vitest'
import { isSensitiveEnvKey, buildSafeEnv } from './env-sanitizer.js'

describe('isSensitiveEnvKey', () => {
  it('allows PATH', () => {
    expect(isSensitiveEnvKey('PATH')).toBe(false)
  })

  it('allows HOME', () => {
    expect(isSensitiveEnvKey('HOME')).toBe(false)
  })

  it('allows USER', () => {
    expect(isSensitiveEnvKey('USER')).toBe(false)
  })

  it('allows TERM', () => {
    expect(isSensitiveEnvKey('TERM')).toBe(false)
  })

  it('allows LANG and LC_*', () => {
    expect(isSensitiveEnvKey('LANG')).toBe(false)
    expect(isSensitiveEnvKey('LC_ALL')).toBe(false)
    expect(isSensitiveEnvKey('LC_CTYPE')).toBe(false)
  })

  it('allows SYSTEMROOT', () => {
    expect(isSensitiveEnvKey('SYSTEMROOT')).toBe(false)
  })

  it('allows TEMP and TMP', () => {
    expect(isSensitiveEnvKey('TEMP')).toBe(false)
    expect(isSensitiveEnvKey('TMP')).toBe(false)
    expect(isSensitiveEnvKey('TMPDIR')).toBe(false)
  })

  it('allows toolchain paths', () => {
    expect(isSensitiveEnvKey('PNPM_HOME')).toBe(false)
    expect(isSensitiveEnvKey('CARGO_HOME')).toBe(false)
    expect(isSensitiveEnvKey('JAVA_HOME')).toBe(false)
    expect(isSensitiveEnvKey('GOPATH')).toBe(false)
  })

  it('strips API keys', () => {
    expect(isSensitiveEnvKey('OPENAI_API_KEY')).toBe(true)
    expect(isSensitiveEnvKey('ANTHROPIC_API_KEY')).toBe(true)
    expect(isSensitiveEnvKey('API_KEY')).toBe(true)
  })

  it('strips AWS credentials', () => {
    expect(isSensitiveEnvKey('AWS_ACCESS_KEY_ID')).toBe(true)
    expect(isSensitiveEnvKey('AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(isSensitiveEnvKey('AWS_SESSION_TOKEN')).toBe(true)
    expect(isSensitiveEnvKey('AWS_REGION')).toBe(true)
  })

  it('strips SSH and GPG variables', () => {
    expect(isSensitiveEnvKey('SSH_AUTH_SOCK')).toBe(true)
    expect(isSensitiveEnvKey('SSH_AGENT_PID')).toBe(true)
    expect(isSensitiveEnvKey('GPG_AGENT_INFO')).toBe(true)
  })

  it('strips internal app secrets', () => {
    expect(isSensitiveEnvKey('LLM_CHAT_MASTER_PASSWORD')).toBe(true)
    expect(isSensitiveEnvKey('ELECTRON_IPC_SECRET')).toBe(true)
  })

  it('strips GitHub/GitLab tokens', () => {
    expect(isSensitiveEnvKey('GITHUB_TOKEN')).toBe(true)
    expect(isSensitiveEnvKey('GITLAB_TOKEN')).toBe(true)
  })

  it('strips unknown keys by default', () => {
    expect(isSensitiveEnvKey('RANDOM_UNKNOWN_VAR')).toBe(true)
  })
})

describe('buildSafeEnv', () => {
  it('preserves allowed vars', () => {
    const env = buildSafeEnv({
      PATH: '/usr/bin',
      HOME: '/home/user',
      USER: 'user',
      TERM: 'xterm-256color',
      OPENAI_API_KEY: 'sk-secret',
    })

    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/user')
    expect(env.USER).toBe('user')
    expect(env.TERM).toBe('xterm-256color')
    expect(env.OPENAI_API_KEY).toBeUndefined()
  })

  it('strips secrets from env', () => {
    const env = buildSafeEnv({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-secret',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      AWS_ACCESS_KEY_ID: 'AKIA...',
      SSH_AUTH_SOCK: '/tmp/ssh-agent',
    })

    expect(env.PATH).toBe('/usr/bin')
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined()
    expect(env.SSH_AUTH_SOCK).toBeUndefined()
  })

  it('sets default LANG if missing', () => {
    const env = buildSafeEnv({ PATH: '/usr/bin' } as Record<string, string>)
    expect(env.LANG).toBe('en_US.UTF-8')
    expect(env.LC_ALL).toBe('en_US.UTF-8')
  })

  it('preserves existing LANG if set', () => {
    const env = buildSafeEnv({ PATH: '/usr/bin', LANG: 'fi_FI.UTF-8' })
    expect(env.LANG).toBe('fi_FI.UTF-8')
  })

  it('allows extra vars that are not sensitive', () => {
    const env = buildSafeEnv(
      { PATH: '/usr/bin' },
      { CUSTOM_TOOL_PATH: '/opt/tools' },
    )
    expect(env.PATH).toBe('/usr/bin')
    // Unknown but explicitly passed extras are allowed since they bypass the filter
  })

  it('strips sensitive extra vars', () => {
    const env = buildSafeEnv(
      { PATH: '/usr/bin' },
      { OPENAI_API_KEY: 'sk-extra' },
    )
    expect(env.OPENAI_API_KEY).toBeUndefined()
  })

  it('ignores undefined or empty env values', () => {
    const env = buildSafeEnv({ PATH: '/usr/bin', FOO: undefined } as Record<string, string | undefined>)
    expect(env.PATH).toBe('/usr/bin')
    expect(env.FOO).toBeUndefined()
  })
})
