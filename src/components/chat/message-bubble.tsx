import { CodeBlock } from '@/components/chat/code-block'
import { ToolCallBlock } from '@/components/chat/tool-call-block'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { cn } from '@/lib/utils'
import type { Message } from '@/types'
import { motion, AnimatePresence } from 'motion/react'
import { type ReactNode, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: ReactNode }>).props.children)
  }
  return ''
}

function ReasoningBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming?: boolean }) {
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
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
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
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
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
            <div className="mt-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {reasoning}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Detect LaTeX-like content: backslash commands, superscripts, subscripts, braces */
const LATEX_RE = /[\\^_{}]|\\[a-zA-Z]+/

/**
 * Normalize various LaTeX notations into $...$ and $$...$$ so remark-math can parse them.
 *
 * remark-math requires:
 *   - display math: $$...$$ on its own lines, separated by blank lines
 *   - inline math: $...$
 *
 * Models produce: \[...\], \(...\), bare [ ... ] on own lines, bare (...) inline.
 */
function normalizeLatex(text: string): string {
  // 1. \[...\] → display math (may be multiline)
  let result = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `\n\n$$\n${inner.trim()}\n$$\n\n`)

  // 2. \(...\) → inline math
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner.trim()}$`)

  // 3. Standalone [ ... ] on its own line with LaTeX content → display math
  result = result.replace(
    /^[ \t]*\[([ \t]*[\s\S]*?)\][ \t]*$/gm,
    (_m, inner) => {
      const trimmed = inner.trim()
      if (LATEX_RE.test(trimmed)) return `\n\n$$\n${trimmed}\n$$\n\n`
      return _m // not math, leave as-is
    },
  )

  // 4. Inline (...) with LaTeX content → inline math
  result = result.replace(
    /\(([^)]+)\)/g,
    (_m, inner) => {
      const trimmed = inner.trim()
      if (LATEX_RE.test(trimmed)) return `$${trimmed}$`
      return _m
    },
  )

  // 5. Ensure $$ display blocks have blank lines around them (remark-math requirement)
  // Note: '$$' in replacement is special in JS regex, use a function to avoid issues
  result = result.replace(/([^\n])\n*\$\$/g, (_m, before) => `${before}\n\n$$`)
  result = result.replace(/\$\$\n*([^\n$])/g, (_m, after) => `$$\n\n${after}`)

  // 6. Collapse excessive blank lines
  result = result.replace(/\n{4,}/g, '\n\n\n')

  return result
}

interface MessageBubbleProps {
  message: Message
  agentName?: string
  agentColor?: string
}

export function MessageBubble({ message, agentName, agentColor }: MessageBubbleProps) {
  const isUser = message.role === 'user'

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
            ? 'max-w-[75%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-primary text-primary-foreground'
            : 'overflow-hidden py-2 text-[14px] leading-[1.8] text-foreground',
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
                    src={att.dataUrl}
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
                  'prose dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                  isUser
                    ? 'prose-sm'
                    : [
                        'text-[14px] leading-[1.8]',
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
    <div className="flex gap-3 py-2 px-4" style={{ width: '100%' }}>
      {content}
    </div>
  )
}
