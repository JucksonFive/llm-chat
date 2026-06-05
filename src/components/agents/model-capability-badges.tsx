import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getModelCapabilities } from '@/lib/model-capabilities'

interface ModelCapabilityBadgesProps {
  model: string
  className?: string
}

export function ModelCapabilityBadges({ model, className }: ModelCapabilityBadgesProps) {
  const capabilities = getModelCapabilities(model)

  if (!capabilities.reasoning && !capabilities.vision && !capabilities.largeContext) {
    return null
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {capabilities.reasoning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              <span className="text-[10px] leading-none">✨</span>
              Reasoning
            </Badge>
          </TooltipTrigger>
          <TooltipContent>This model uses extended reasoning for complex questions</TooltipContent>
        </Tooltip>
      )}
      {capabilities.vision && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
              <span className="text-[10px] leading-none">🖼️</span>
              Vision
            </Badge>
          </TooltipTrigger>
          <TooltipContent>This model can analyze images</TooltipContent>
        </Tooltip>
      )}
      {capabilities.largeContext && capabilities.contextSize && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1 text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
              <span className="text-[10px] leading-none">📚</span>
              {capabilities.contextSize} context
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Large context window - can process long documents</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
