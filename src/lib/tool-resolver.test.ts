import { describe, it, expect, beforeEach } from 'vitest'
import { computeToolContext, resolveAvailableTools } from './tool-resolver'
import type { Message, BuiltInToolId } from '@/types'
import { useDocumentStore } from '@/stores/document-store'

describe('tool-resolver', () => {
  beforeEach(() => {
    // Reset document store before each test
    useDocumentStore.setState({ documents: [], loaded: false, loading: false })
  })

  describe('computeToolContext', () => {
    it('detects uploaded PDFs', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createdAt: Date.now(),
          attachments: [{ id: 'a1', type: 'pdf', name: 'doc.pdf' }],
        },
      ]

      const context = computeToolContext(messages, 'openai')
      expect(context.hasUploadedPdf).toBe(true)
    })

    it('returns false when no PDFs', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createdAt: Date.now(),
        },
      ]

      const context = computeToolContext(messages, 'openai')
      expect(context.hasUploadedPdf).toBe(false)
    })

    it('detects indexed documents', () => {
      useDocumentStore.setState({
        documents: [{ id: '1', path: '/test.pdf', chunkCount: 10, mtime: Date.now(), indexedAt: Date.now() }],
        loaded: true,
        loading: false,
      })

      const context = computeToolContext([], 'openai')
      expect(context.hasIndexedDocument).toBe(true)
    })

    it('includes providerId in context', () => {
      const context = computeToolContext([], 'anthropic')
      expect(context.providerId).toBe('anthropic')
    })
  })

  describe('resolveAvailableTools', () => {
    const openaiContext = { hasUploadedPdf: false, hasIndexedDocument: false, workspaceAccessEnabled: false, providerId: 'openai' as const }

    it('resolves tools for Bedrock like any other provider (Converse API supports tools)', () => {
      const agentToolIds: BuiltInToolId[] = []
      const context = { ...openaiContext, providerId: 'bedrock' as const }

      const available = resolveAvailableTools(agentToolIds, context)

      expect(available).toContain('web-search')
      expect(available).toContain('web-fetch')
      expect(available).toContain('calculator')
      expect(available).toContain('datetime')
    })

    it('includes default-enabled tools when agent has empty tool list', () => {
      const agentToolIds: BuiltInToolId[] = []

      const available = resolveAvailableTools(agentToolIds, openaiContext)

      expect(available).toContain('web-search')
      expect(available).toContain('web-fetch')
      expect(available).toContain('calculator')
      expect(available).toContain('datetime')
      expect(available).not.toContain('code-executor')
      expect(available).not.toContain('file-writer')
    })

    it('respects manual tool enabling', () => {
      const agentToolIds: BuiltInToolId[] = ['code-executor', 'file-reader', 'web-search']

      const available = resolveAvailableTools(agentToolIds, openaiContext)

      expect(available).toContain('code-executor')
      expect(available).toContain('file-reader')
      expect(available).toContain('web-search')
      // Tools not in the list should not be included
      expect(available).not.toContain('file-writer')
    })

    it('respects manual tool disabling', () => {
      const agentToolIds: BuiltInToolId[] = ['calculator'] // Only calculator, excluding other defaults

      const available = resolveAvailableTools(agentToolIds, openaiContext)

      expect(available).toContain('calculator')
      // Other default tools are considered manually disabled
      expect(available).not.toContain('web-search')
      expect(available).not.toContain('web-fetch')
      expect(available).not.toContain('datetime')
    })

    it('conditionally enables pdf-reader when PDF is uploaded', () => {
      const agentToolIds: BuiltInToolId[] = []
      const context = { ...openaiContext, hasUploadedPdf: true }

      const available = resolveAvailableTools(agentToolIds, context)

      expect(available).toContain('pdf-reader')
    })

    it('conditionally enables search-document when document is indexed', () => {
      const agentToolIds: BuiltInToolId[] = []
      const context = { ...openaiContext, hasIndexedDocument: true }

      const available = resolveAvailableTools(agentToolIds, context)

      expect(available).toContain('search-document')
    })

    it('does not enable conditional tools when context is false', () => {
      const agentToolIds: BuiltInToolId[] = []

      const available = resolveAvailableTools(agentToolIds, openaiContext)

      expect(available).not.toContain('pdf-reader')
      expect(available).not.toContain('search-document')
    })

    it('manual enable overrides conditional logic', () => {
      const agentToolIds: BuiltInToolId[] = ['pdf-reader']

      const available = resolveAvailableTools(agentToolIds, openaiContext)

      // pdf-reader should be included even without uploaded PDF because it's manually enabled
      expect(available).toContain('pdf-reader')
    })
  })
})
