export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <div className="typing-dot h-2 w-2 rounded-full bg-muted-foreground/50" />
      <div className="typing-dot h-2 w-2 rounded-full bg-muted-foreground/50" />
      <div className="typing-dot h-2 w-2 rounded-full bg-muted-foreground/50" />
    </div>
  )
}
