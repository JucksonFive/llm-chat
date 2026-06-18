import { encrypt, decrypt } from './crypto.js'
import { isEncryptionEnabled } from './db-encryption.js'
import { query, queryOne, run } from './db.js'

/**
 * Error thrown when a stored API key cannot be decrypted while the user has
 * opted into encryption (LLM_CHAT_MASTER_PASSWORD set). Routes can catch this
 * and turn it into a user-visible error instead of silently failing.
 */
export class DecryptionError extends Error {
  constructor(agentId: string) {
    super(
      `Failed to decrypt the stored API key for agent ${agentId}. ` +
        'The key may be corrupted or was encrypted on another machine. ' +
        'Please re-enter the API key in the agent settings.',
    )
    this.name = 'DecryptionError'
  }
}

/**
 * Decrypt a stored API key, handling the `null` failure case.
 *
 * On failure logs a warning and returns `''` (no key) so the app keeps working.
 * If encryption is enabled (LLM_CHAT_MASTER_PASSWORD is set), a failure is
 * treated as a hard error and {@link DecryptionError} is thrown so the route
 * can surface a user-visible message.
 */
function decryptApiKey(encrypted: string, agentId: string): string {
  const decrypted = decrypt(encrypted)
  if (decrypted === null) {
    console.warn(
      `[crypto] Failed to decrypt API key for agent ${agentId} — key may be corrupted or from another machine`,
    )
    if (isEncryptionEnabled()) {
      throw new DecryptionError(agentId)
    }
    return ''
  }
  return decrypted
}

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
  return row?.api_key_encrypted ? decryptApiKey(row.api_key_encrypted, agentId) : ''
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
    const apiKey = decryptApiKey(row.api_key_encrypted, row.id)
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
