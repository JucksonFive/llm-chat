import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMode, PermissionProfile } from '@/types'

interface UIState {
  theme: 'dark' | 'light'
  autoSpeak: boolean
  permissionProfile: PermissionProfile
  chatMode: ChatMode
  toggleTheme: () => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleAutoSpeak: () => void
  setPermissionProfile: (profile: PermissionProfile) => void
  setChatMode: (mode: ChatMode) => void
  togglePlanMode: () => void
}

/** Strip markdown / code / latex for cleaner TTS output */
export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`[^`]+`/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' (formula) ')
    .replace(/\$[^$]+\$/g, ' (formula) ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_~>|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim()
}

export function speakText(text: string) {
  const clean = cleanTextForSpeech(text)
  if (!clean || typeof window === 'undefined' || !('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.rate = 1.0
  speechSynthesis.speak(utterance)
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      autoSpeak: false,
      permissionProfile: 'workspace-write' as PermissionProfile,
      chatMode: 'chat' as ChatMode,

      toggleTheme: () => {
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark'
          document.documentElement.classList.toggle('dark', next === 'dark')
          return { theme: next }
        })
      },

      setTheme: (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        set({ theme })
      },

      toggleAutoSpeak: () => set((state) => ({ autoSpeak: !state.autoSpeak })),

      setPermissionProfile: (profile) => set({ permissionProfile: profile }),

      setChatMode: (mode) => set({ chatMode: mode }),

      togglePlanMode: () => set((state) => ({
        chatMode: state.chatMode === 'plan' ? 'chat' : 'plan',
      })),
    }),
    {
      name: 'llm-chat-ui',
      partialize: (state) => ({
        theme: state.theme,
        autoSpeak: state.autoSpeak,
        permissionProfile: state.permissionProfile,
        chatMode: state.chatMode,
      }),
    }
  )
)
