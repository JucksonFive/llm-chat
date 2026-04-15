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
      className={cn(
        'flex gap-3 py-2',
        isUser ? 'justify-end px-4' : 'px-4 w-full',
      )}
      style={!isUser ? { maxWidth: '100%' } : undefined}
    >
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
            : 'py-2 text-[14px] leading-[1.8] text-foreground',
        )}
        style={!isUser ? { flex: '1 1 0%', minWidth: 0, maxWidth: '100%' } : undefined}
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
