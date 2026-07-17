/**
 * In-memory tool approval service.
 *
 * Manages the lifecycle of tool approval requests within a chat session.
 * Approvals are session-scoped (stored only in memory, cleared on server
 * restart). Each approval request is bound to:
 *   - Project ID
 *   - Tool name
 *   - Argument hash (SHA-256 of canonical JSON)
 *   - Granted resources
 *   - Expiry time (5 minutes)
 *
 * Session approvals allow the same tool+args combination to be auto-approved
 * for the rest of the conversation without repeated prompts.
 */

import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalDecision = 'approve-once' | 'approve-session' | 'deny'

export interface ApprovalRequest {
  /** Unique approval ID (random UUID). */
  id: string
  /** The tool call ID from the AI SDK / Bedrock stream. */
  toolCallId: string
  /** Tool name as registered (e.g., 'powershell_executor'). */
  toolName: string
  /** Tool execution arguments. */
  args: Record<string, unknown>
  /** Project ID for workspace-bound approvals. */
  projectId: string
  /** Risk level of the tool. */
  riskLevel: string
  /** Hash of (toolName + canonicalArgs + projectId) for dedup. */
  requestHash: string
  /** Resources the tool requested access to. */
  resources: string[]
  /** When the request expires (5 min from creation). */
  expiresAt: number
  /** User decision, if any. */
  decision?: ApprovalDecision
  /** When the decision was made. */
  decidedAt?: number
}

interface SessionApproval {
  /** Hash of the approved permission key. */
  hash: string
  /** Tool name for display. */
  toolName: string
  /** When the session approval was granted. */
  grantedAt: number
}

// ---------------------------------------------------------------------------
// Default expiry and cleanup
// ---------------------------------------------------------------------------

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000 // 1 minute

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class ApprovalStore {
  private pending = new Map<string, ApprovalRequest>()
  private sessionApprovals = new Map<string, Map<string, SessionApproval>>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startCleanup()
  }

  // ── Request management ──────────────────────────────────────────

  /** Create a new pending approval request. */
  createRequest(params: {
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
    projectId: string
    riskLevel: string
    resources?: string[]
  }): ApprovalRequest {
    const id = crypto.randomUUID()
    const requestHash = this.hashRequest(params.toolName, params.args, params.projectId)

    const request: ApprovalRequest = {
      id,
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      args: params.args,
      projectId: params.projectId,
      riskLevel: params.riskLevel,
      requestHash,
      resources: params.resources ?? [],
      expiresAt: Date.now() + APPROVAL_TIMEOUT_MS,
    }

    this.pending.set(id, request)
    return request
  }

  /** Get a pending request by ID. */
  getRequest(id: string): ApprovalRequest | undefined {
    const request = this.pending.get(id)
    if (!request) return undefined
    if (request.expiresAt < Date.now()) {
      this.pending.delete(id)
      return undefined
    }
    return request
  }

  /** Apply a decision to a pending request. */
  decide(
    id: string,
    decision: ApprovalDecision,
    sessionId?: string,
  ): { ok: true } | { error: string } {
    const request = this.pending.get(id)
    if (!request) {
      return { error: 'not-found' }
    }
    if (request.expiresAt < Date.now()) {
      this.pending.delete(id)
      return { error: 'expired' }
    }
    if (request.decision) {
      return { error: 'already-decided' }
    }

    request.decision = decision
    request.decidedAt = Date.now()

    // If session-approved, store for future auto-approval
    if (decision === 'approve-session' && sessionId) {
      this.addSessionApproval(sessionId, request)
    }

    // Clean up pending immediately
    this.pending.delete(id)

    return { ok: true }
  }

  // ── Session approvals ───────────────────────────────────────────

  private addSessionApproval(sessionId: string, request: ApprovalRequest): void {
    let session = this.sessionApprovals.get(sessionId)
    if (!session) {
      session = new Map()
      this.sessionApprovals.set(sessionId, session)
    }
    session.set(request.requestHash, {
      hash: request.requestHash,
      toolName: request.toolName,
      grantedAt: Date.now(),
    })
  }

  /** Check if a tool call is approved for the session. */
  checkSessionApproval(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    projectId: string,
  ): boolean {
    const hash = this.hashRequest(toolName, args, projectId)
    const session = this.sessionApprovals.get(sessionId)
    if (!session) return false
    return session.has(hash)
  }

  /** Clear all approvals for a session. */
  clearSession(sessionId: string): void {
    this.sessionApprovals.delete(sessionId)
  }

  /** Remove all pending requests and session approvals. */
  clearAll(): void {
    this.pending.clear()
    this.sessionApprovals.clear()
  }

  // ── Hashing ─────────────────────────────────────────────────────

  /**
   * Create a deterministic hash of the tool call for deduplication.
   * Same tool + same args + same project = same hash.
   */
  hashRequest(
    toolName: string,
    args: Record<string, unknown>,
    projectId: string,
  ): string {
    // Canonicalize args: stable-sort keys, JSON with sorted keys
    const canonicalArgs = JSON.stringify(args, Object.keys(args).sort())
    const input = `${toolName}:${canonicalArgs}:${projectId}`
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32)
  }

  // ── Maintenance ─────────────────────────────────────────────────

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [id, request] of this.pending) {
        if (request.expiresAt < now) {
          this.pending.delete(id)
        }
      }
    }, CLEANUP_INTERVAL_MS)
  }

  /** Stop the cleanup timer (call before shutdown). */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.clearAll()
  }
}

// Singleton instance
export const approvalStore = new ApprovalStore()
