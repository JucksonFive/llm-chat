import { ProviderSelect } from '@/components/agents/provider-select'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_PRESETS } from '@/lib/default-system-prompt'
import { PROVIDERS } from '@/lib/providers'
import { useAgentStore } from '@/stores/agent-store'
import { useMcpStore } from '@/stores/mcp-store'
import type { BuiltInToolId, ProviderId } from '@/types'
import { Eye, EyeOff, Server, Trash2, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'

const DEFAULT_SYSTEM_PROMPT = `You are a knowledgeable and honest assistant. Follow these principles:

- Be accurate: Only state things you are confident about. If you are unsure or don't recognize something (e.g. a program name, concept, or claim), say so clearly instead of guessing.
- Ask for clarification when the user's request is ambiguous or references something you don't recognize.
- Be concise: Give focused, direct answers. Avoid unnecessary filler, repetition, or overly long responses.
- When you have access to tools (web search, code execution, etc.), use them proactively to verify facts and provide up-to-date information rather than relying on potentially outdated knowledge.
- Cite sources with URLs when using information from web searches.
- Respond in the same language the user writes in.`

const BUILT_IN_TOOL_LIST: { id: BuiltInToolId; name: string; description: string }[] = [
  { id: 'web-fetch', name: 'Fetch URL', description: 'Fetch content from a URL' },
  { id: 'web-search', name: 'Web Search', description: 'Search the web for information' },
  { id: 'code-executor', name: 'Code Executor', description: 'Execute JavaScript, Python, or shell code' },
  { id: 'file-reader', name: 'File Reader', description: 'Read files from the local filesystem' },
  { id: 'file-writer', name: 'File Writer', description: 'Write or create files on the filesystem' },
  { id: 'calculator', name: 'Calculator', description: 'Evaluate mathematical expressions' },
  { id: 'pdf-reader', name: 'PDF Reader', description: 'Read and extract text from PDF files' },
  { id: 'datetime', name: 'Date & Time', description: 'Get current time, convert timezones, date differences' },
  { id: 'image-generator', name: 'Image Generator', description: 'Generate images with OpenAI DALL-E / gpt-image-1' },
  { id: 'deep-research', name: 'Deep Research', description: 'Multi-step web research with source compilation' },
]

interface AgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editAgentId: string | null
}

export function AgentDialog({ open, onOpenChange, editAgentId }: AgentDialogProps) {
  const { agents, addAgent, updateAgent, deleteAgent } = useAgentStore()
  const editingAgent = editAgentId ? agents.find((a) => a.id === editAgentId) : null

  const [name, setName] = useState('')
  const [providerId, setProviderId] = useState<ProviderId>('openai')
  const [model, setModel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([])
  const [selectedBuiltInTools, setSelectedBuiltInTools] = useState<BuiltInToolId[]>([])

  const mcpServers = useMcpStore((s) => s.servers)
  const provider = PROVIDERS[providerId]
  const models = provider.models
  const isCustomModel = provider.freeTextModel
  const matchedPreset = SYSTEM_PROMPT_PRESETS.find((preset) => preset.prompt === systemPrompt)

  useEffect(() => {
    if (editingAgent) {
      setName(editingAgent.name)
      setProviderId(editingAgent.providerId)
      setModel(editingAgent.model)
      setCustomModel(editingAgent.model)
      setApiKey(editingAgent.apiKey)
      setSystemPrompt(editingAgent.systemPrompt)
      setSelectedMcpIds(editingAgent.mcpServerIds ?? [])
      setSelectedBuiltInTools((editingAgent.builtInToolIds ?? []) as BuiltInToolId[])
    } else {
      setName('')
      setProviderId('openai')
      setModel('gpt-4o')
      setCustomModel('')
      setApiKey('')
      setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
      setSelectedMcpIds([])
      setSelectedBuiltInTools([])
    }
    setShowApiKey(false)
  }, [editingAgent, open])

  useEffect(() => {
    if (!isCustomModel && models.length > 0 && !models.includes(model)) {
      setModel(models[0])
    }
  }, [providerId, models, isCustomModel, model])

  const handleSave = async () => {
    const finalModel = isCustomModel ? customModel : model
    if (!name.trim() || !finalModel.trim()) return
    if (provider.requiresApiKey && !apiKey.trim()) return

    if (editingAgent) {
      await updateAgent(editingAgent.id, {
        name: name.trim(),
        providerId,
        model: finalModel.trim(),
        apiKey: apiKey.trim(),
        systemPrompt: systemPrompt.trim(),
        mcpServerIds: selectedMcpIds,
        builtInToolIds: selectedBuiltInTools,
      })
    } else {
      await addAgent({
        name: name.trim(),
        providerId,
        model: finalModel.trim(),
        apiKey: apiKey.trim(),
        systemPrompt: systemPrompt.trim(),
        mcpServerIds: selectedMcpIds,
        builtInToolIds: selectedBuiltInTools,
      })
    }
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (editingAgent) {
      await deleteAgent(editingAgent.id)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editingAgent ? 'Edit Agent' : 'Create Agent'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4 overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Assistant"
              autoComplete="off"
              data-form-type="other"
            />
          </div>

          <div className="grid gap-2">
            <Label>Provider</Label>
            <ProviderSelect value={providerId} onValueChange={setProviderId} />
          </div>

          <div className="grid gap-2">
            <Label>Model</Label>
            {isCustomModel ? (
              <Input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. llama3.1, mistral, codellama"
              />
            ) : (
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {provider.requiresApiKey && (
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="pr-10"
                  autoComplete="off"
                  data-form-type="other"
                  data-lpignore="true"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <div className="flex flex-wrap gap-2">
              {SYSTEM_PROMPT_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant={matchedPreset?.id === preset.id ? 'default' : 'outline'}
                  onClick={() => setSystemPrompt(preset.prompt)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {matchedPreset
                ? matchedPreset.description
                : 'Custom prompt in use. Selecting a preset will replace the current text.'}
            </p>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define the agent's behavior, depth, and quality bar..."
              className="min-h-[220px]"
            />
          </div>

          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Built-in Tools
            </Label>
            <div className="space-y-2 rounded-lg border border-border/50 p-3">
              {BUILT_IN_TOOL_LIST.map((tool) => (
                <div key={tool.id} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm">{tool.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {tool.description}
                    </span>
                  </div>
                  <Switch
                    checked={selectedBuiltInTools.includes(tool.id)}
                    onCheckedChange={(checked) => {
                      setSelectedBuiltInTools((prev) =>
                        checked
                          ? [...prev, tool.id]
                          : prev.filter((id) => id !== tool.id)
                      )
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {mcpServers.length > 0 && (
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" />
                MCP Tools
              </Label>
              <div className="space-y-2 rounded-lg border border-border/50 p-3">
                {mcpServers.map((server) => (
                  <div key={server.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{server.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {server.transport}
                      </span>
                    </div>
                    <Switch
                      checked={selectedMcpIds.includes(server.id)}
                      onCheckedChange={(checked) => {
                        setSelectedMcpIds((prev) =>
                          checked
                            ? [...prev, server.id]
                            : prev.filter((id) => id !== server.id)
                        )
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          {editingAgent && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="mr-auto"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingAgent ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
