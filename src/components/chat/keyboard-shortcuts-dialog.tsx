import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Keyboard } from 'lucide-react'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Shortcut {
  keys: string[]
  description: string
  category: string
}

const SHORTCUTS: Shortcut[] = [
  // Search & Navigation
  { keys: ['Ctrl', 'K'], description: 'Open global search', category: 'Search' },
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Search' },
  { keys: ['Esc'], description: 'Close dialog or panel', category: 'Search' },

  // Messaging
  { keys: ['Enter'], description: 'Send message', category: 'Messaging' },
  { keys: ['Shift', 'Enter'], description: 'New line in message', category: 'Messaging' },

  // File handling
  { keys: ['Drag', 'Drop'], description: 'Attach files (images/PDFs)', category: 'Files' },
  { keys: ['Ctrl', 'V'], description: 'Paste files from clipboard', category: 'Files' },
]

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded border border-border/50 bg-muted/50 text-xs font-mono font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  )
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  // Group shortcuts by category
  const grouped = SHORTCUTS.reduce<Record<string, Shortcut[]>>((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {})

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </h3>
              <div className="space-y-1.5">
                {shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <span key={keyIdx} className="flex items-center gap-1">
                          {keyIdx > 0 && <span className="text-xs text-muted-foreground">+</span>}
                          <KeyBadge>{key}</KeyBadge>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4 pt-3 border-t border-border/30">
          On Mac, use <KeyBadge>⌘</KeyBadge> instead of <KeyBadge>Ctrl</KeyBadge>
        </p>
      </DialogContent>
    </Dialog>
  )
}
