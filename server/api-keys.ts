import { encrypt, decrypt } from './crypto.js'
import { query, queryOne, run } from './db.js'

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
}

interface AgentCredentialRow {
  api_key_encrypted: string
}

interface ProviderCredentialRow {
  id: string
  api_key_encrypted: string
}

function cleanSecret(secret: string): string {
  return secret.trim()
}

export function hasAgentApiKey(agentId: string): boolean {
  const row = queryOne<AgentCredentialRow>(
    'SELECT api_key_encrypted FROM agents WHERE id=$agentId',
    { agentId },
  )
  return Boolean(row?.api_key_encrypted)
}

export function setAgentApiKey(agentId: string, apiKey: string): void {
  const secret = cleanSecret(apiKey)
  run(
    'UPDATE agents SET api_key_encrypted=$apiKeyEncrypted WHERE id=$agentId',
    {
      agentId,
      apiKeyEncrypted: secret ? encrypt(secret) : '',
    },
  )
}

export function clearAgentApiKey(agentId: string): void {
  run('UPDATE agents SET api_key_encrypted=\'\' WHERE id=$agentId', { agentId })
}

export function getAgentApiKey(agentId: string): string {
  const row = queryOne<AgentCredentialRow>(
    'SELECT api_key_encrypted FROM agents WHERE id=$agentId',
    { agentId },
  )
  return row?.api_key_encrypted ? decrypt(row.api_key_encrypted) : ''
}

export function findApiKeyForProvider(providerId: string): string {
  const rows = query<ProviderCredentialRow>(
    `SELECT id, api_key_encrypted
     FROM agents
     WHERE provider_id=$providerId AND api_key_encrypted != ''
     ORDER BY created_at ASC`,
    { providerId },
  )

  for (const row of rows) {
    const apiKey = decrypt(row.api_key_encrypted)
    if (apiKey) return apiKey
  }

  return ''
}

export function resolveApiKeyForAgent(agentId: string | undefined, providerId: string): string {
  if (agentId) {
    const agentKey = getAgentApiKey(agentId)
    if (agentKey) return agentKey
  }

  return findApiKeyForProvider(providerId)
}

export function parseAwsCredentials(raw: string): AwsCredentials | undefined {
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<AwsCredentials>
    if (
      typeof parsed.accessKeyId === 'string' &&
      typeof parsed.secretAccessKey === 'string' &&
      typeof parsed.region === 'string' &&
      parsed.accessKeyId.trim() &&
      parsed.secretAccessKey.trim() &&
      parsed.region.trim()
    ) {
      return {
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
        region: parsed.region,
      }
    }
  } catch {
    return undefined
  }

  return undefined
}
