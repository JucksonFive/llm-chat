import { describe, expect, it, beforeEach } from 'vitest'
import { useResearchStore } from './research-store'

describe('research-store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useResearchStore.setState({
      activeResearchId: null,
      researches: {},
    })
  })

  describe('startResearch', () => {
    it('creates a new research session', () => {
      const conversationId = 'conv-123'
      const researchId = useResearchStore.getState().startResearch(conversationId)

      expect(researchId).toBeTruthy()
      expect(useResearchStore.getState().activeResearchId).toBe(researchId)

      const research = useResearchStore.getState().researches[researchId]
      expect(research).toBeDefined()
      expect(research.conversationId).toBe(conversationId)
      expect(research.stage).toBe('planning')
      expect(research.sources).toEqual([])
      expect(research.progress).toBe(0)
      expect(research.isPanelMinimized).toBe(false)
    })

    it('initializes all stage timings', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')
      const research = useResearchStore.getState().researches[researchId]

      expect(research.stageTimings.planning).toBeGreaterThan(0)
      expect(research.stageTimings.searching).toBe(0)
      expect(research.stageTimings.fetching).toBe(0)
      expect(research.stageTimings.analyzing).toBe(0)
      expect(research.stageTimings.synthesizing).toBe(0)
      expect(research.stageTimings.reporting).toBe(0)
    })
  })

  describe('updateStage', () => {
    it('updates the current stage and timing', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')
      const beforeTime = Date.now()

      useResearchStore.getState().updateStage(researchId, 'searching')

      const research = useResearchStore.getState().researches[researchId]
      expect(research.stage).toBe('searching')
      expect(research.stageTimings.searching).toBeGreaterThanOrEqual(beforeTime)
    })

    it('handles invalid research ID gracefully', () => {
      useResearchStore.getState().updateStage('invalid-id', 'searching')
      // Should not throw or crash
      expect(useResearchStore.getState().researches['invalid-id']).toBeUndefined()
    })
  })

  describe('addSource', () => {
    it('adds a source with loading status', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')
      const source = {
        url: 'https://example.com',
        title: 'Example Article',
      }

      useResearchStore.getState().addSource(researchId, source)

      const research = useResearchStore.getState().researches[researchId]
      expect(research.sources).toHaveLength(1)
      expect(research.sources[0]).toEqual({
        ...source,
        status: 'loading',
      })
    })

    it('allows multiple sources', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      useResearchStore.getState().addSource(researchId, {
        url: 'https://example.com/1',
        title: 'Article 1',
      })
      useResearchStore.getState().addSource(researchId, {
        url: 'https://example.com/2',
        title: 'Article 2',
      })

      const research = useResearchStore.getState().researches[researchId]
      expect(research.sources).toHaveLength(2)
    })
  })

  describe('updateSource', () => {
    it('updates source status by URL', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')
      const url = 'https://example.com'

      useResearchStore.getState().addSource(researchId, { url, title: 'Article' })
      useResearchStore.getState().updateSource(researchId, url, 'complete')

      const research = useResearchStore.getState().researches[researchId]
      expect(research.sources[0].status).toBe('complete')
    })

    it('only updates matching URL', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      useResearchStore.getState().addSource(researchId, {
        url: 'https://example.com/1',
        title: 'Article 1',
      })
      useResearchStore.getState().addSource(researchId, {
        url: 'https://example.com/2',
        title: 'Article 2',
      })

      useResearchStore.getState().updateSource(researchId, 'https://example.com/1', 'error')

      const research = useResearchStore.getState().researches[researchId]
      expect(research.sources[0].status).toBe('error')
      expect(research.sources[1].status).toBe('loading')
    })
  })

  describe('updateProgress', () => {
    it('updates progress percentage', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      useResearchStore.getState().updateProgress(researchId, 45)

      const research = useResearchStore.getState().researches[researchId]
      expect(research.progress).toBe(45)
    })

    it('allows progress from 0 to 100', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      useResearchStore.getState().updateProgress(researchId, 0)
      expect(useResearchStore.getState().researches[researchId].progress).toBe(0)

      useResearchStore.getState().updateProgress(researchId, 100)
      expect(useResearchStore.getState().researches[researchId].progress).toBe(100)
    })
  })

  describe('completeResearch', () => {
    it('sets stage to reporting and progress to 100', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      useResearchStore.getState().completeResearch(researchId)

      const research = useResearchStore.getState().researches[researchId]
      expect(research.stage).toBe('reporting')
      expect(research.progress).toBe(100)
      expect(useResearchStore.getState().activeResearchId).toBeNull()
    })
  })

  describe('togglePanel', () => {
    it('toggles minimized state', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      expect(useResearchStore.getState().researches[researchId].isPanelMinimized).toBe(false)

      useResearchStore.getState().togglePanel(researchId)
      expect(useResearchStore.getState().researches[researchId].isPanelMinimized).toBe(true)

      useResearchStore.getState().togglePanel(researchId)
      expect(useResearchStore.getState().researches[researchId].isPanelMinimized).toBe(false)
    })
  })

  describe('clearResearch', () => {
    it('removes research from store', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      expect(useResearchStore.getState().researches[researchId]).toBeDefined()

      useResearchStore.getState().clearResearch(researchId)

      expect(useResearchStore.getState().researches[researchId]).toBeUndefined()
    })

    it('clears activeResearchId if it matches', () => {
      const researchId = useResearchStore.getState().startResearch('conv-123')

      expect(useResearchStore.getState().activeResearchId).toBe(researchId)

      useResearchStore.getState().clearResearch(researchId)

      expect(useResearchStore.getState().activeResearchId).toBeNull()
    })

    it('does not clear activeResearchId if different', () => {
      const researchId1 = useResearchStore.getState().startResearch('conv-123')
      const researchId2 = useResearchStore.getState().startResearch('conv-456')

      // Active is now researchId2
      expect(useResearchStore.getState().activeResearchId).toBe(researchId2)

      useResearchStore.getState().clearResearch(researchId1)

      expect(useResearchStore.getState().activeResearchId).toBe(researchId2)
    })
  })

  describe('stage progression workflow', () => {
    it('simulates complete research flow', () => {
      const conversationId = 'conv-123'

      // Start research
      const researchId = useResearchStore.getState().startResearch(conversationId)
      expect(useResearchStore.getState().researches[researchId].stage).toBe('planning')

      // Progress through stages
      useResearchStore.getState().updateStage(researchId, 'searching')
      useResearchStore.getState().updateProgress(researchId, 20)

      // Add sources during search
      useResearchStore.getState().addSource(researchId, {
        url: 'https://example.com/1',
        title: 'Source 1',
      })
      useResearchStore.getState().addSource(researchId, {
        url: 'https://example.com/2',
        title: 'Source 2',
      })

      // Move to fetching
      useResearchStore.getState().updateStage(researchId, 'fetching')
      useResearchStore.getState().updateProgress(researchId, 40)

      // Mark sources as complete
      useResearchStore.getState().updateSource(researchId, 'https://example.com/1', 'complete')
      useResearchStore.getState().updateSource(researchId, 'https://example.com/2', 'complete')

      // Continue through stages
      useResearchStore.getState().updateStage(researchId, 'analyzing')
      useResearchStore.getState().updateProgress(researchId, 60)

      useResearchStore.getState().updateStage(researchId, 'synthesizing')
      useResearchStore.getState().updateProgress(researchId, 80)

      // Complete
      useResearchStore.getState().completeResearch(researchId)

      const research = useResearchStore.getState().researches[researchId]
      expect(research.stage).toBe('reporting')
      expect(research.progress).toBe(100)
      expect(research.sources).toHaveLength(2)
      expect(research.sources.every((s) => s.status === 'complete')).toBe(true)
      expect(useResearchStore.getState().activeResearchId).toBeNull()
    })
  })
})
