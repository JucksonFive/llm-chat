import { CODING_AGENT_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT } from '@/lib/default-system-prompt'
import type { BuiltInToolId, ProviderId } from '@/types'

export interface AgentTemplate {
  id: string
  name: string
  description: string
  providerId: ProviderId
  model: string
  systemPrompt: string
  builtInToolIds: BuiltInToolId[]
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'general-assistant',
    name: 'Professional Assistant',
    description: 'Balanced general-purpose agent with a professional default prompt.',
    providerId: 'openai',
    model: 'gpt-5.4',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    builtInToolIds: [],
  },
  {
    id: 'programmer-docs',
    name: 'Programmer Docs Expert',
    description: 'Checks docs, verifies version-sensitive answers, and recommends solid engineering practices.',
    providerId: 'openai',
    model: 'gpt-5.4',
    systemPrompt: CODING_AGENT_SYSTEM_PROMPT,
    builtInToolIds: [
      'web-search',
      'web-fetch',
      'file-reader',
      'file-writer',
      'pdf-reader',
      'calculator',
      'code-executor',
      'deep-research',
    ],
  },
]

export const DEFAULT_AGENT_TEMPLATE = AGENT_TEMPLATES[0]
export const PROGRAMMER_AGENT_TEMPLATE = AGENT_TEMPLATES[1]
