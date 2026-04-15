import { CodeBlock } from '@/components/chat/code-block'
import { ToolCallBlock } from '@/components/chat/tool-call-block'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { cn } from '@/lib/utils'
import type { Message } from '@/types'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: ReactNode }>).props.children)
  }
  return ''
}

interface MessageBubbleProps {
  message: Message
  agentName?: string
  agentColor?: string
}

export function MessageBubble({ message, agentName, agentColor }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('flex gap-3 px-4 py-2', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: agentColor || '#6366f1' }}
        >
          {agentName?.charAt(0)?.toUpperCase() || 'A'}
        </div>
      )}

      <div
        className={cn(
          'rounded-2xl px-4 text-sm leading-relaxed',
          isUser
            ? 'max-w-[75%] py-2.5 bg-primary text-primary-foreground rounded-br-md'
            : 'max-w-[85%] py-4 bg-muted/50 text-foreground rounded-bl-md',
        )}
      >
        {message.isStreaming && !message.content && !message.toolCalls?.length && !message.thinking ? (
          <TypingIndicator />
        ) : (
          <>
            {!isUser && message.thinking && (
              <details className="mb-3 group/think" open={message.thinking.isStreaming}>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground/70 hover:text-muted-foreground select-none flex items-center gap-1.5">
                  <svg className={cn('h-3.5 w-3.5', message.thinking.isStreaming && 'animate-spin')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    {message.thinking.isStreaming
                      ? <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    }
                  </svg>
                  {message.thinking.isStreaming ? 'Thinking...' : 'Thought process'}
                </summary>
                <div className="mt-2 text-xs text-muted-foreground/60 leading-relaxed whitespace-pre-wrap border-l-2 border-muted-foreground/10 pl-3">
                  {message.thinking.content}
                </div>
              </details>
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
                  'prose dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                  isUser
                    ? 'prose-sm'
                    : 'prose-lg leading-8 prose-p:my-4 prose-headings:mt-8 prose-headings:mb-4 prose-headings:font-semibold prose-li:my-1.5 prose-ul:my-4 prose-ol:my-4 prose-blockquote:border-l-2 prose-blockquote:border-muted-foreground/30 prose-blockquote:pl-4 prose-blockquote:italic',
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
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
                  {message.content}
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
    </motion.div>
  )
}
