import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLocalLlmStore, type GpuMode } from '@/stores/local-llm-store'
import { Cpu, RefreshCw, Power, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  const gb = bytes / 1024 / 1024 / 1024
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 / 1024
  return `${mb.toFixed(0)} MB`
}

export function LocalLlmSection() {
  const {
    selectedModelPath, gpu, gpuLayers, contextSize, threads,
    status, modelsDir, availableModels, loading, error,
    setSelectedModelPath, setGpu, setGpuLayers, setContextSize, setThreads,
    refreshModels, refreshStatus, loadModel, unloadModel,
  } = useLocalLlmStore()

  useEffect(() => {
    refreshStatus()
    refreshModels()
  }, [refreshStatus, refreshModels])

  const handleLoad = async () => {
    await loadModel()
    const errNow = useLocalLlmStore.getState().error
    const statusNow = useLocalLlmStore.getState().status
    if (errNow) toast.error(errNow)
    else if (statusNow.loaded) toast.success(`Loaded ${statusNow.modelName} on ${statusNow.gpuType}`)
  }

  const handleUnload = async () => {
    await unloadModel()
    toast.success('Model unloaded')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Local AI (llama.cpp)
        </h3>
        <Button variant="ghost" size="sm" onClick={() => { refreshModels(); refreshStatus() }}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Drop <code className="text-[11px]">.gguf</code> model files into{' '}
          <code className="text-[11px] break-all">{modelsDir || '~/.llm-chat/models'}</code>{' '}
          and they will appear below.
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs">Model</Label>
          <Select
            value={selectedModelPath ?? ''}
            onValueChange={(v) => setSelectedModelPath(v || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={availableModels.length ? 'Select a model' : 'No .gguf files found'} />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m.path} value={m.path}>
                  {m.name} <span className="text-muted-foreground ml-2">({formatSize(m.sizeBytes)})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Compute</Label>
            <Select value={gpu} onValueChange={(v) => setGpu(v as GpuMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpu">CPU only</SelectItem>
                <SelectItem value="auto">GPU (auto-detect)</SelectItem>
                <SelectItem value="cuda">GPU – CUDA (NVIDIA)</SelectItem>
                <SelectItem value="metal">GPU – Metal (macOS)</SelectItem>
                <SelectItem value="vulkan">GPU – Vulkan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              GPU layers {gpu === 'cpu' ? '(disabled)' : ''}
            </Label>
            <Input
              type="number"
              min={0}
              max={999}
              value={gpuLayers}
              disabled={gpu === 'cpu'}
              onChange={(e) => setGpuLayers(Math.max(0, parseInt(e.target.value || '0', 10)))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Context size</Label>
            <Input
              type="number"
              min={512}
              step={512}
              value={contextSize}
              onChange={(e) => setContextSize(Math.max(512, parseInt(e.target.value || '4096', 10)))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">CPU threads</Label>
            <Input
              type="number"
              min={1}
              max={64}
              value={threads}
              onChange={(e) => setThreads(Math.max(1, parseInt(e.target.value || '4', 10)))}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Tip: set <b>GPU layers</b> to a high number (e.g. 999) to offload the whole model to GPU,
          or a smaller number to split between GPU and CPU when VRAM is tight.
        </p>

        <div className="flex gap-2">
          <Button
            onClick={handleLoad}
            disabled={!selectedModelPath || loading}
            className="flex-1"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {status.loaded ? 'Reload with new settings' : 'Load model'}
          </Button>
          {status.loaded && (
            <Button variant="outline" onClick={handleUnload} disabled={loading}>
              <Power className="h-4 w-4 mr-2" />
              Unload
            </Button>
          )}
        </div>

        {status.loaded && (
          <div className="text-xs rounded-md border border-border bg-muted/30 p-2 space-y-0.5">
            <div><span className="text-muted-foreground">Loaded:</span> {status.modelName}</div>
            <div>
              <span className="text-muted-foreground">Running on:</span>{' '}
              <b>{status.gpuType}</b>
              {status.gpu && status.gpu !== 'cpu' && (
                <> · {status.gpuLayers} layer(s) on GPU</>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Context:</span> {status.contextSize} ·{' '}
              <span className="text-muted-foreground">threads:</span> {status.threads}
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive">{error}</div>
        )}
      </div>
    </div>
  )
}
