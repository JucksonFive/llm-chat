import { Moon, Sun } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useUIStore } from '@/stores/ui-store'

export function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore()

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {theme === 'dark' ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
        <Label>Dark Mode</Label>
      </div>
      <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
    </div>
  )
}
