import { create } from 'zustand'

export type ResearchStage = 'planning' | 'searching' | 'fetching' | 'analyzing' | 'synthesizing' | 'reporting'

export interface ResearchSource {
  url: string
  title: string
  status: 'loading' | 'complete' | 'error'
}

export interface Research {
  id: string
  conversationId: string
  stage: ResearchStage
  sources: ResearchSource[]
  progress: number // 0-100
  startTime: number
  stageTimings: Record<ResearchStage, number>
  isPanelMinimized: boolean
}

interface ResearchState {
  activeResearchId: string | null
  researches: Record<string, Research>

  startResearch: (conversationId: string) => string
  updateStage: (researchId: string, stage: ResearchStage) => void
  addSource: (researchId: string, source: Omit<ResearchSource, 'status'>) => void
  updateSource: (researchId: string, url: string, status: ResearchSource['status']) => void
  updateProgress: (researchId: string, progress: number) => void
  completeResearch: (researchId: string) => void
  togglePanel: (researchId: string) => void
  clearResearch: (researchId: string) => void
}

export const useResearchStore = create<ResearchState>()((set) => ({
  activeResearchId: null,
  researches: {},

  startResearch: (conversationId) => {
    const id = crypto.randomUUID()
    const research: Research = {
      id,
      conversationId,
      stage: 'planning',
      sources: [],
      progress: 0,
      startTime: Date.now(),
      stageTimings: {
        planning: Date.now(),
        searching: 0,
        fetching: 0,
        analyzing: 0,
        synthesizing: 0,
        reporting: 0,
      },
      isPanelMinimized: false,
    }
    set((state) => ({
      researches: { ...state.researches, [id]: research },
      activeResearchId: id,
    }))
    return id
  },

  updateStage: (researchId, stage) => {
    set((state) => {
      const research = state.researches[researchId]
      if (!research) return state
      return {
        researches: {
          ...state.researches,
          [researchId]: {
            ...research,
            stage,
            stageTimings: {
              ...research.stageTimings,
              [stage]: Date.now(),
            },
          },
        },
      }
    })
  },

  addSource: (researchId, source) => {
    set((state) => {
      const research = state.researches[researchId]
      if (!research) return state
      return {
        researches: {
          ...state.researches,
          [researchId]: {
            ...research,
            sources: [...research.sources, { ...source, status: 'loading' }],
          },
        },
      }
    })
  },

  updateSource: (researchId, url, status) => {
    set((state) => {
      const research = state.researches[researchId]
      if (!research) return state
      return {
        researches: {
          ...state.researches,
          [researchId]: {
            ...research,
            sources: research.sources.map((s) =>
              s.url === url ? { ...s, status } : s
            ),
          },
        },
      }
    })
  },

  updateProgress: (researchId, progress) => {
    set((state) => {
      const research = state.researches[researchId]
      if (!research) return state
      return {
        researches: {
          ...state.researches,
          [researchId]: { ...research, progress },
        },
      }
    })
  },

  completeResearch: (researchId) => {
    set((state) => {
      const research = state.researches[researchId]
      if (!research) return state
      return {
        researches: {
          ...state.researches,
          [researchId]: {
            ...research,
            stage: 'reporting',
            progress: 100,
          },
        },
        activeResearchId: null,
      }
    })
  },

  togglePanel: (researchId) => {
    set((state) => {
      const research = state.researches[researchId]
      if (!research) return state
      return {
        researches: {
          ...state.researches,
          [researchId]: {
            ...research,
            isPanelMinimized: !research.isPanelMinimized,
          },
        },
      }
    })
  },

  clearResearch: (researchId) => {
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [researchId]: _removed, ...rest } = state.researches
      return {
        researches: rest,
        activeResearchId:
          state.activeResearchId === researchId ? null : state.activeResearchId,
      }
    })
  },
}))
