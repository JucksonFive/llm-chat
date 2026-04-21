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
import { AGENT_TEMPLATES } from '@/lib/agent-templates'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_PRESETS } from '@/lib/default-system-prompt'
import { PROVIDERS } from '@/lib/providers'
import { useAgentStore } from '@/stores/agent-store'
import { useApiKeyStore } from '@/stores/api-key-store'
import { useMcpStore } from '@/stores/mcp-store'
import type { BuiltInToolId, ProviderId, Agent } from '@/types'
import { Eye, EyeOff, Server, Trash2, Wrench } from 'lucide-react'
import { useState } from 'react'

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
  const agents = useAgentStore((s) => s.agents)
  const editingAgent = editAgentId ? agents.find((a) => a.id === editAgentId) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <AgentForm
          key={`${editAgentId ?? 'new'}-${open}`}
          editingAgent={editingAgent ?? null}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function AgentForm({
  editingAgent,
  onClose,
}: {
  editingAgent: Agent | null
  onClose: () => void
}) {
  const { agents, addAgent, updateAgent, deleteAgent } = useAgentStore()
  const mcpServers = useMcpStore((s) => s.servers)
  const apiKeyStore = useApiKeyStore()

  const getApiKeyForProvider = (pid: ProviderId) =>
    apiKeyStore.findKeyForProvider(pid, agents)

  const initialApiKey = editingAgent
    ? apiKeyStore.getKey(editingAgent.id) || getApiKeyForProvider(editingAgent.providerId)
    : getApiKeyForProvider('openai')

  const [name, setName] = useState(editingAgent?.name ?? '')
  const [providerId, setProviderId] = useState<ProviderId>(editingAgent?.providerId ?? 'openai')
  const [model, setModel] = useState(editingAgent?.model ?? 'gpt-4o')
  const [customModel, setCustomModel] = useState(editingAgent?.model ?? '')
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [systemPrompt, setSystemPrompt] = useState(editingAgent?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT)
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>(editingAgent?.mcpServerIds ?? [])
  const [selectedBuiltInTools, setSelectedBuiltInTools] = useState<BuiltInToolId[]>((editingAgent?.builtInToolIds ?? []) as BuiltInToolId[])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const provider = PROVIDERS[providerId]
  const models = provider.models
  const isCustomModel = provider.freeTextModel
  const matchedPreset = SYSTEM_PROMPT_PRESETS.find((preset) => preset.prompt === systemPrompt)

  const effectiveModel = isCustomModel ? model : (models.includes(model) ? model : models[0])

  const handleProviderChange = (newProviderId: ProviderId) => {
    setProviderId(newProviderId)
    const newProvider = PROVIDERS[newProviderId]
    if (!newProvider.freeTextModel && newProvider.models.length > 0) {
      setModel(newProvider.models[0])
    }
    setApiKey(getApiKeyForProvider(newProviderId))
  }

  const applyTemplate = (templateId: string) => {
    if (templateId === 'custom') {
      setName('')
      setProviderId('openai')
      setModel(PROVIDERS['openai'].models[0])
      setCustomModel('')
      setSystemPrompt('')
      setSelectedBuiltInTools([])
      setSelectedMcpIds([])
      return
    }

    const template = AGENT_TEMPLATES.find((item) => item.id === templateId)
    if (!template) return

    setName(template.name)
    setProviderId(template.providerId)
    setModel(template.model)
    setCustomModel(template.model)
    setSystemPrompt(template.systemPrompt)
    setSelectedBuiltInTools(template.builtInToolIds)
    setSelectedMcpIds([])
    setApiKey(getApiKeyForProvider(template.providerId))
  }

  const clearError = (field: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const handleSave = async () => {
    const finalModel = isCustomModel ? customModel : effectiveModel
    const newErrors: Record<string, string> = {}
    if (!name.trim()) newErrors.name = 'Name is required'
    if (!finalModel.trim()) newErrors.model = 'Model is required'
    if (provider.requiresApiKey && !apiKey.trim()) newErrors.apiKey = 'API key is required'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    if (editingAgent) {
      await updateAgent(editingAgent.id, {
        name: name.trim(),
        providerId,
        model: finalModel.trim(),
        systemPrompt: systemPrompt.trim(),
        mcpServerIds: selectedMcpIds,
        builtInToolIds: selectedBuiltInTools,
      })
      apiKeyStore.setKey(editingAgent.id, apiKey.trim())
    } else {
      const createdAgent = await addAgent({
        name: name.trim(),
        providerId,
        model: finalModel.trim(),
        systemPrompt: systemPrompt.trim(),
        mcpServerIds: selectedMcpIds,
        builtInToolIds: selectedBuiltInTools,
      })
      apiKeyStore.setKey(createdAgent.id, apiKey.trim())
    }
    onClose()
  }

  const handleDelete = async () => {
    if (editingAgent) {
      apiKeyStore.removeKey(editingAgent.id)
      await deleteAgent(editingAgent.id)
      onClose()
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editingAgent ? 'Edit Agent' : 'Create Agent'}
        </DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-4 overflow-y-auto">
        <div className="grid gap-2">
          <Label>Templates</Label>
          <div className="flex flex-wrap gap-2">
            {AGENT_TEMPLATES.map((template) => (
              <Button
                key={template.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyTemplate(template.id)}
              >
                {template.name}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyTemplate('custom')}
            >
              Custom
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Load a ready-made agent profile with prompt, model, and tool defaults.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => { setName(e.target.value); clearError('name') }}
            placeholder="My Assistant"
            autoComplete="off"
            data-form-type="other"
            className={errors.name ? 'border-destructive' : ''}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="grid gap-2">
          <Label>Provider</Label>
          <ProviderSelect value={providerId} onValueChange={handleProviderChange} />
        </div>

        <div className="grid gap-2">
          <Label>Model</Label>
          {isCustomModel ? (
            <>
              <Select
                value={models.includes(customModel) ? customModel : ''}
                onValueChange={(v) => { setCustomModel(v); clearError('model') }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a popular model…" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={customModel}
                onChange={(e) => { setCustomModel(e.target.value); clearError('model') }}
                placeholder="…or type any model tag, e.g. llama3.1:70b"
                className={errors.model ? 'border-destructive' : ''}
              />
            </>
          ) : (
            <Select value={effectiveModel} onValueChange={setModel}>
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
          {errors.model && <p className="text-xs text-destructive">{errors.model}</p>}
        </div>

        {provider.requiresApiKey && (
          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); clearError('apiKey') }}
                placeholder="sk-..."
                className={`pr-10${errors.apiKey ? ' border-destructive' : ''}`}
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
            {errors.apiKey && <p className="text-xs text-destructive">{errors.apiKey}</p>}
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
            <Button
              type="button"
              size="sm"
              variant={!matchedPreset ? 'default' : 'outline'}
              onClick={() => setSystemPrompt('')}
            >
              Custom
            </Button>
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {editingAgent ? 'Save' : 'Create'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
