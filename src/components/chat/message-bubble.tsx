import { CodeBlock } from '@/components/chat/code-block'
import { normalizeLatex } from '@/components/chat/normalize-latex'
import { ToolCallBlock } from '@/components/chat/tool-call-block'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { cn } from '@/lib/utils'
import { cleanTextForSpeech } from '@/stores/ui-store'
import type { Message } from '@/types'
import 'katex/dist/katex.min.css'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: ReactNode }>).props.children)
  }
  return ''
}

function ReasoningBlock({ reasoning, isStreaming }: Readonly<{ reasoning: string; isStreaming?: boolean }>) {
  // Auto-open while streaming, auto-collapse when done
  const [userToggled, setUserToggled] = useState(false)
  const isOpen = userToggled ? !isStreaming : isStreaming

  const handleToggle = () => {
    setUserToggled((prev) => !prev)
  }

  return (
    <div className="mb-3">
      <button
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium transition-colors',
          isStreaming ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <svg
          className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-90')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="flex items-center gap-1.5">
          {isStreaming ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Thinking...
            </>
          ) : (
            <>
              <span className="text-base leading-none">💡</span>
              Thought process
            </>
          )}
        </span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={cn(
              'mt-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto',
              isStreaming
                ? 'border-amber-500/30 bg-amber-500/5 text-foreground'
                : 'border-border/50 bg-muted/30 text-muted-foreground'
            )}>
              {reasoning}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  agentName?: string
  agentColor?: string
}

function SpeakButton({ text }: { text: string }) {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    const clean = cleanTextForSpeech(text)
    if (!clean) return

    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.rate = 1.0
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }, [text, isSpeaking])

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null

  return (
    <button
      onClick={handleSpeak}
      className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
    >
      {isSpeaking ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6v4H9z" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8l4.7-3.5c.7-.5 1.6-.05 1.6.8v11.8c0 .85-.9 1.3-1.6.8l-4.7-3.5H4a1.5 1.5 0 01-1.5-1.5v-3.8A1.5 1.5 0 014 8.8h2.5z" />
        </svg>
      )}
      {isSpeaking ? 'Stop' : 'Listen'}
    </button>
  )
}

export function MessageBubble({ message, agentName, agentColor }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const tokenCount = useMemo(() => {
    if (message.isStreaming) return null
    return message.content.split(/[\s,.!?;:]+/).filter(Boolean).length
  }, [message.content, message.isStreaming])

  const content = (
    <>
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white mt-1"
          style={{ backgroundColor: agentColor || '#6366f1' }}
        >
          {agentName?.charAt(0)?.toUpperCase() || 'A'}
        </div>
      )}

      <div
        className={cn(
          isUser
            ? 'max-w-[75%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-blue-600 dark:bg-blue-500 text-white'
            : 'relative overflow-hidden py-2 text-[14px] leading-[1.8] text-foreground',
        )}
        style={!isUser ? { flex: '1 1 0%', minWidth: 0 } : undefined}
      >
        {message.isStreaming && !message.content && !message.toolCalls?.length && !message.reasoning ? (
          <TypingIndicator />
        ) : (
          <>
            {!isUser && message.reasoning && (
              <ReasoningBlock reasoning={message.reasoning} isStreaming={message.isStreaming} />
            )}
            {isUser && message.attachments?.map((att) => (
              <div key={att.id} className="mb-2">
                {att.type === 'image' ? (
                  <img
                    src={att.dataUrl ?? `/api/db/attachments/${att.id}/file`}
                    alt={att.name}
                    className="max-w-[240px] rounded-lg"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 text-xs opacity-80">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    {att.name}
                  </div>
                )}
              </div>
            ))}
            {message.content && (
              <div
                className={cn(
                  'prose [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                  isUser
                    ? 'prose-sm prose-invert'
                    : [
                        'dark:prose-invert text-[14px] leading-[1.8]',
                        'prose-p:my-3 prose-p:leading-[1.8]',
                        'prose-headings:mt-8 prose-headings:mb-3 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:leading-tight',
                        'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base',
                        'prose-li:my-1 prose-li:leading-[1.7]',
                        'prose-ul:my-3 prose-ol:my-3 prose-ul:pl-5 prose-ol:pl-5',
                        'prose-blockquote:border-l-2 prose-blockquote:border-muted-foreground/30 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground prose-blockquote:my-4',
                        'prose-strong:font-semibold prose-strong:text-foreground',
                        'prose-a:text-blue-500 prose-a:underline prose-a:underline-offset-2',
                        'prose-hr:my-6 prose-hr:border-border/50',
                      ].join(' '),
                )}
                style={{ maxWidth: '100%' }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeHighlight, rehypeKatex]}
                  components={{
                    hr() {
                      return <div className="my-6" />
                    },
                    pre({ children }) {
                      return <>{children}</>
                    },
                    code({ className, children, ...props }) {
                      const isInline = !className
                      if (isInline) {
                        return (
                          <code
                            className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs"
                            {...props}
                          >
                            {children}
                          </code>
                        )
                      }
                      const text = extractText(children).replace(/\n$/, '')
                      return (
                        <CodeBlock className={className} rawText={text}>
                          {children}
                        </CodeBlock>
                      )
                    },
                  }}
                >
                  {normalizeLatex(message.content)}
                </ReactMarkdown>
              </div>
            )}
            {message.toolCalls?.map((tc) => (
              <ToolCallBlock key={tc.id} toolCall={tc} />
            ))}
            {!isUser && message.content && !message.isStreaming && (
              <SpeakButton text={message.content} />
            )}

            {/* Token counter for streaming messages */}
            {!isUser && message.isStreaming && message.isGeneratingContent && tokenCount && tokenCount > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
                className="absolute bottom-1 right-2 text-xs text-muted-foreground"
              >
                ~{tokenCount} tokens
              </motion.div>
            )}

            {/* Streaming status indicator */}
            {!isUser && message.isStreaming && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <span className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full animate-pulse',
                  message.isGeneratingContent ? 'bg-blue-500' : 'bg-amber-500'
                )} />
                <span className={cn(
                  'font-medium',
                  message.isGeneratingContent ? 'text-blue-600 dark:text-blue-500' : 'text-amber-600 dark:text-amber-500'
                )}>
                  {message.isGeneratingContent ? 'Generating...' : 'Thinking...'}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-medium text-white">
          U
        </div>
      )}
    </>
  )

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex gap-3 py-2 justify-end px-4"
      >
        {content}
      </motion.div>
    )
  }

  return (
    <div className="group flex gap-3 py-2 px-4" style={{ width: '100%' }}>
      {content}
    </div>
  )
}
