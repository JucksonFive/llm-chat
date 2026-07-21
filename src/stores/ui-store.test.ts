// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanTextForSpeech, speakText, useUIStore } from './ui-store'

function reset() {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  useUIStore.setState({
    theme: 'dark',
    autoSpeak: false,
    permissionProfile: 'workspace-write',
    chatMode: 'chat',
  })
}

beforeEach(reset)

describe('cleanTextForSpeech', () => {
  it('replaces fenced code blocks with a placeholder', () => {
    expect(cleanTextForSpeech('Hello\n```js\nconsole.log()\n```\nworld')).toContain('(code block)')
  })

  it('strips inline code', () => {
    expect(cleanTextForSpeech('See `foo` for details')).toBe('See  for details')
  })

  it('replaces $$..$$ display math with a formula placeholder', () => {
    expect(cleanTextForSpeech('Result: $$x^2 + 1$$')).toContain('(formula)')
  })

  it('replaces $..$ inline math with a formula placeholder', () => {
    expect(cleanTextForSpeech('Use $E=mc^2$ here')).toContain('(formula)')
  })

  it('preserves the visible text of a markdown link, dropping the URL', () => {
    expect(cleanTextForSpeech('See [Google](https://google.com) here')).toBe('See Google here')
  })

  it('strips markdown formatting characters', () => {
    expect(cleanTextForSpeech('**bold** _italic_ ~strike~ #heading >quote |table|')).toBe(
      'bold italic strike heading quote table',
    )
  })

  it('collapses double newlines into a sentence boundary', () => {
    expect(cleanTextForSpeech('first\n\nsecond')).toBe('first. second')
  })

  it('joins single newlines with a space', () => {
    expect(cleanTextForSpeech('one\ntwo')).toBe('one two')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(cleanTextForSpeech('   ')).toBe('')
  })
})

describe('speakText', () => {
  it('does nothing when speechSynthesis is not in window', () => {
    // jsdom does not include speechSynthesis by default, so the `in` check
    // returns false. This pins that the function bails out cleanly.
    expect('speechSynthesis' in window).toBe(false)
    expect(() => speakText('hello')).not.toThrow()
  })

  it('does nothing when the cleaned text is empty', () => {
    const cancel = vi.fn()
    const speak = vi.fn()
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel, speak },
    })
    try {
      speakText('')
      expect(cancel).not.toHaveBeenCalled()
      expect(speak).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(window, 'speechSynthesis')
    }
  })

  it('calls cancel + speak with a SpeechSynthesisUtterance', () => {
    const cancel = vi.fn()
    const speak = vi.fn()
    const Utterance = vi.fn(function (this: { text: string; rate?: number }, text: string) {
      this.text = text
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel, speak },
    })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: Utterance,
    })
    try {
      speakText('hello world')
      expect(cancel).toHaveBeenCalled()
      expect(speak).toHaveBeenCalledTimes(1)
      expect(Utterance).toHaveBeenCalledWith('hello world')
    } finally {
      Reflect.deleteProperty(window, 'speechSynthesis')
      Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
    }
  })
})

describe('useUIStore', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('starts with dark theme, autoSpeak off, and chat mode active', () => {
    expect(useUIStore.getState().theme).toBe('dark')
    expect(useUIStore.getState().autoSpeak).toBe(false)
    expect(useUIStore.getState().chatMode).toBe('chat')
  })

  it('toggleTheme flips theme and updates document class', () => {
    document.documentElement.classList.add('dark')
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme syncs the document class', () => {
    useUIStore.getState().setTheme('light')
    expect(useUIStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    useUIStore.getState().setTheme('dark')
    expect(useUIStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggleAutoSpeak flips the flag', () => {
    useUIStore.getState().toggleAutoSpeak()
    expect(useUIStore.getState().autoSpeak).toBe(true)
    useUIStore.getState().toggleAutoSpeak()
    expect(useUIStore.getState().autoSpeak).toBe(false)
  })

  it('toggles plan mode and can set the mode explicitly', () => {
    useUIStore.getState().togglePlanMode()
    expect(useUIStore.getState().chatMode).toBe('plan')

    useUIStore.getState().togglePlanMode()
    expect(useUIStore.getState().chatMode).toBe('chat')

    useUIStore.getState().setChatMode('plan')
    expect(useUIStore.getState().chatMode).toBe('plan')
  })
})
