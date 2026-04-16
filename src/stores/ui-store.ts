import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  theme: 'dark' | 'light'
  autoSpeak: boolean
  toggleTheme: () => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleAutoSpeak: () => void
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
    }),
    { name: 'llm-chat-ui' }
  )
)
