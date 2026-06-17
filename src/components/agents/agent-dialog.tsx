import { ModelCapabilityBadges } from '@/components/agents/model-capability-badges'
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
import { API_KEY_TRANSPORT_WARNING } from '@/lib/api-key-transport'
import { SYSTEM_PROMPT_PRESETS } from '@/lib/default-system-prompt'
import { PROVIDERS } from '@/lib/providers'
import { useAgentStore } from '@/stores/agent-store'
import { useApiKeyStore } from '@/stores/api-key-store'
import { useMcpStore } from '@/stores/mcp-store'
import type { Agent, BuiltInToolId, BuiltInToolMeta, ProviderId } from '@/types'
import { Eye, EyeOff, Server, ShieldAlert, Trash2, Wrench } from 'lucide-react'
import { useState, useEffect } from 'react'

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
  const [builtInToolList, setBuiltInToolList] = useState<BuiltInToolMeta[]>([])
  const [toolsInitialized, setToolsInitialized] = useState(false)
  const [selectedBuiltInTools, setSelectedBuiltInTools] = useState<BuiltInToolId[]>((editingAgent?.builtInToolIds ?? []) as BuiltInToolId[])

  // Fetch built-in tools from API on mount
  useEffect(() => {
    fetch('/api/tools/built-in')
      .then((res) => res.json())
      .then((data) => {
        setBuiltInToolList(data.tools)

        // When creating a new agent (not editing), initialize with default tools
        if (!editingAgent && !toolsInitialized) {
          const defaultTools = data.tools
            .filter((tool: BuiltInToolMeta) => tool.enabledByDefault)
            .map((tool: BuiltInToolMeta) => tool.id)
          setSelectedBuiltInTools(defaultTools)
          setToolsInitialized(true)
        }
      })
      .catch((err) => console.error('[agent-dialog] Failed to fetch built-in tools:', err))
  }, [editingAgent, toolsInitialized])
  // Use selectors so this form only re-renders when the action functions
  // identity changes (i.e. never), not on every keys-record mutation.
  const hasKey = useApiKeyStore((s) => s.hasKey)
  const setKey = useApiKeyStore((s) => s.setKey)
  const removeKey = useApiKeyStore((s) => s.removeKey)
  const hasKeyForProvider = useApiKeyStore((s) => s.hasKeyForProvider)
  const setAwsCredentials = useApiKeyStore((s) => s.setAwsCredentials)

  const hasApiKeyForProvider = (pid: ProviderId) => hasKeyForProvider(pid, agents)

  const initialApiKey = ''

  const [name, setName] = useState(editingAgent?.name ?? '')
  const [providerId, setProviderId] = useState<ProviderId>(editingAgent?.providerId ?? 'openai')
  const [model, setModel] = useState(editingAgent?.model ?? 'gpt-4o')
  const [customModel, setCustomModel] = useState(editingAgent?.model ?? '')
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [systemPrompt, setSystemPrompt] = useState(editingAgent?.systemPrompt ?? '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>(editingAgent?.mcpServerIds ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})

  // AWS Bedrock credentials
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('')
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('us-east-1')
  const [showAwsSecretKey, setShowAwsSecretKey] = useState(false)

  const provider = PROVIDERS[providerId]
  const models = provider.models
  const isCustomModel = provider.freeTextModel
  const matchedPreset = SYSTEM_PROMPT_PRESETS.find((preset) => preset.prompt === systemPrompt)
  const hasSavedApiKey = Boolean(editingAgent && providerId === editingAgent.providerId && hasKey(editingAgent.id))
  const hasProviderApiKey = hasApiKeyForProvider(providerId)

  const effectiveModel = isCustomModel ? model : (models.includes(model) ? model : models[0])

  const handleProviderChange = (newProviderId: ProviderId) => {
    setProviderId(newProviderId)
    const newProvider = PROVIDERS[newProviderId]
    if (!newProvider.freeTextModel && newProvider.models.length > 0) {
      setModel(newProvider.models[0])
    }
    if (newProviderId === 'bedrock') {
      setAwsAccessKeyId('')
      setAwsSecretAccessKey('')
    } else {
      setApiKey('')
    }
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

    // Validate credentials based on provider
    if (providerId === 'bedrock') {
      // AWS credentials are optional - if not provided, server will use its AWS config
      // But if user starts filling them in, validate that all three are present
      const hasAnyAwsCred = awsAccessKeyId.trim() || awsSecretAccessKey.trim()
      if (hasAnyAwsCred) {
        if (!awsAccessKeyId.trim()) newErrors.awsAccessKeyId = 'Access Key ID required when providing credentials'
        if (!awsSecretAccessKey.trim()) newErrors.awsSecretAccessKey = 'Secret Key required when providing credentials'
        if (!awsRegion.trim()) newErrors.awsRegion = 'Region required when providing credentials'
      }
    } else if (
      provider.requiresApiKey &&
      !apiKey.trim() &&
      !(editingAgent && providerId === editingAgent.providerId && hasSavedApiKey) &&
      !hasProviderApiKey
    ) {
      newErrors.apiKey = 'API key is required'
    }

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
      if (providerId === 'bedrock') {
        // Only save credentials if they were provided
        if (awsAccessKeyId.trim() && awsSecretAccessKey.trim() && awsRegion.trim()) {
          await setAwsCredentials(editingAgent.id, {
            accessKeyId: awsAccessKeyId.trim(),
            secretAccessKey: awsSecretAccessKey.trim(),
            region: awsRegion.trim(),
          })
        } else if (editingAgent.providerId !== providerId) {
          await removeKey(editingAgent.id)
        }
      } else {
        if (apiKey.trim()) {
          await setKey(editingAgent.id, apiKey.trim())
        } else if (editingAgent.providerId !== providerId || !provider.requiresApiKey) {
          await removeKey(editingAgent.id)
        }
      }
    } else {
      const created = await addAgent({
        name: name.trim(),
        providerId,
        model: finalModel.trim(),
        systemPrompt: systemPrompt.trim(),
        mcpServerIds: selectedMcpIds,
        builtInToolIds: selectedBuiltInTools,
      })
      if (providerId === 'bedrock') {
        // Only save credentials if they were provided
        if (awsAccessKeyId.trim() && awsSecretAccessKey.trim() && awsRegion.trim()) {
          await setAwsCredentials(created.id, {
            accessKeyId: awsAccessKeyId.trim(),
            secretAccessKey: awsSecretAccessKey.trim(),
            region: awsRegion.trim(),
          })
        }
      } else {
        if (apiKey.trim()) {
          await setKey(created.id, apiKey.trim())
        }
      }
    }
    onClose()
  }

  const handleDelete = async () => {
    if (editingAgent) {
      await removeKey(editingAgent.id)
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
            <Input
              value={customModel}
              onChange={(e) => { setCustomModel(e.target.value); clearError('model') }}
              placeholder="e.g. llama3.1, mistral, codellama"
              className={errors.model ? 'border-destructive' : ''}
            />
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
          <ModelCapabilityBadges model={isCustomModel ? customModel : effectiveModel} className="mt-1" />
        </div>

        {providerId === 'bedrock' ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="awsAccessKeyId">
                AWS Access Key ID <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="awsAccessKeyId"
                type="text"
                value={awsAccessKeyId}
                onChange={(e) => { setAwsAccessKeyId(e.target.value); clearError('awsAccessKeyId') }}
                placeholder="AKIA... (leave empty to use server's AWS config)"
                className={errors.awsAccessKeyId ? 'border-destructive' : ''}
                autoComplete="off"
                data-form-type="other"
              />
              {errors.awsAccessKeyId && <p className="text-xs text-destructive">{errors.awsAccessKeyId}</p>}
              {!awsAccessKeyId && !awsSecretAccessKey && (
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the server's AWS credentials (environment variables, ~/.aws/credentials, or IAM role).
                  Ensure the credentials have <code className="bg-muted px-1 py-0.5 rounded">bedrock:InvokeModel</code> and{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">bedrock:InvokeModelWithResponseStream</code> permissions.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="awsSecretAccessKey">
                AWS Secret Access Key <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="awsSecretAccessKey"
                  type={showAwsSecretKey ? 'text' : 'password'}
                  value={awsSecretAccessKey}
                  onChange={(e) => { setAwsSecretAccessKey(e.target.value); clearError('awsSecretAccessKey') }}
                  placeholder="wJalrXUtnFEMI..."
                  className={`pr-10${errors.awsSecretAccessKey ? ' border-destructive' : ''}`}
                  autoComplete="off"
                  data-form-type="other"
                  data-lpignore="true"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10"
                  onClick={() => setShowAwsSecretKey(!showAwsSecretKey)}
                >
                  {showAwsSecretKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {errors.awsSecretAccessKey && <p className="text-xs text-destructive">{errors.awsSecretAccessKey}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="awsRegion">AWS Region</Label>
              <Select value={awsRegion} onValueChange={(val) => { setAwsRegion(val); clearError('awsRegion') }}>
                <SelectTrigger className={errors.awsRegion ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">us-east-1 (N. Virginia)</SelectItem>
                  <SelectItem value="us-west-2">us-west-2 (Oregon)</SelectItem>
                  <SelectItem value="eu-west-1">eu-west-1 (Ireland)</SelectItem>
                  <SelectItem value="eu-central-1">eu-central-1 (Frankfurt)</SelectItem>
                  <SelectItem value="ap-southeast-1">ap-southeast-1 (Singapore)</SelectItem>
                  <SelectItem value="ap-northeast-1">ap-northeast-1 (Tokyo)</SelectItem>
                </SelectContent>
              </Select>
              {errors.awsRegion && <p className="text-xs text-destructive">{errors.awsRegion}</p>}
            </div>
            <p
              role="note"
              className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400"
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{API_KEY_TRANSPORT_WARNING}</span>
            </p>
          </>
        ) : provider.requiresApiKey && (
          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); clearError('apiKey') }}
                placeholder={hasSavedApiKey || hasProviderApiKey ? 'Saved API key' : 'sk-...'}
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
            {!errors.apiKey && !apiKey && (hasSavedApiKey || hasProviderApiKey) && (
              <p className="text-xs text-muted-foreground">
                A saved API key is available. Enter a new one only to replace it.
              </p>
            )}
            <p
              role="note"
              className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400"
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{API_KEY_TRANSPORT_WARNING}</span>
            </p>
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
              : systemPrompt.trim()
                ? 'Custom prompt in use. Selecting a preset will replace the current text.'
                : 'No system prompt (model default behavior). You can add a preset or write your own.'}
          </p>
          <Textarea
            id="systemPrompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="(Optional) Define the agent's behavior, depth, and quality bar..."
            className="min-h-[220px]"
          />
        </div>

        <div className="grid gap-2">
          <Label className="flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Built-in Tools
          </Label>
          <p className="text-xs text-muted-foreground">
            Tools marked "Default" are automatically available. Toggle to override.
          </p>
          <div className="space-y-2 rounded-lg border border-border/50 p-3">
            {builtInToolList.map((tool) => {
              const riskBadgeColor =
                tool.riskLevel === 'safe' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                tool.riskLevel === 'costly' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' :
                'bg-red-500/10 text-red-600 dark:text-red-400'

              return (
                <div key={tool.id} className="flex items-center justify-between gap-3">
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm">{tool.name}</span>
                      {tool.enabledByDefault && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                          Default
                        </span>
                      )}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${riskBadgeColor}`}>
                        {tool.riskLevel === 'safe' ? 'Safe' : tool.riskLevel === 'costly' ? 'Costly' : 'Requires Approval'}
                      </span>
                    </div>
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
              )
            })}
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
