/**
 * Tool approval HTTP routes.
 *
 * POST /api/tool-approvals/:approvalId
 *   Body: { decision: 'approve-once' | 'approve-session' | 'deny', sessionId?: string }
 *   Response: { ok: true } or { error: 'expired' | 'not-found' | 'already-decided' }
 */

import type { Express } from 'express'
import { approvalStore } from './approval-service.js'
import { logSecurityEvent } from './audit-log.js'
import type { ApprovalDecision } from './approval-service.js'

export function registerApprovalRoutes(app: Express): void {
  app.post('/api/tool-approvals/:approvalId', (req, res) => {
    const { approvalId } = req.params
    const { decision, sessionId } = req.body ?? {}

    if (!decision || !['approve-once', 'approve-session', 'deny'].includes(decision as string)) {
      res.status(400).json({
        error: 'decision is required and must be one of: approve-once, approve-session, deny',
      })
      return
    }

    const result = approvalStore.decide(approvalId, decision as ApprovalDecision, sessionId)

    if ('error' in result) {
      const statusMap: Record<string, number> = {
        'not-found': 404,
        'expired': 410,
        'already-decided': 409,
      }
      const status = statusMap[result.error] || 400

      logSecurityEvent('approval.decision', {
        approvalId,
        decision,
        success: false,
        error: result.error,
      }, 'warning')

      res.status(status).json({ error: result.error })
      return
    }

    logSecurityEvent('approval.decision', {
      approvalId,
      decision,
      sessionId: sessionId || null,
      success: true,
    })

    res.json({ ok: true })
  })
}
