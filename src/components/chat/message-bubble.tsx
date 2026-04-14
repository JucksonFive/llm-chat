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
        {message.isStreaming && !message.content && !message.toolCalls?.length ? (
          <TypingIndicator />
        ) : (
          <>
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
