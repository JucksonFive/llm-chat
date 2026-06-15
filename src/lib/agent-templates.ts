import { CODING_AGENT_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT, HUMANIZER_SYSTEM_PROMPT, MARKET_RESEARCHER_SYSTEM_PROMPT, SYSTEM_PROMPT_CREATOR_SYSTEM_PROMPT } from '@/lib/default-system-prompt'
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
    builtInToolIds: ['web-search', 'web-fetch', 'calculator', 'datetime'],
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
      'index-document',
      'search-document',
    ],
  },
  {
    id: 'market-researcher',
    name: 'Market Researcher',
    description: 'Finds the absolute lowest prices online — total cost analysis, coupon stacking, cross-border arbitrage.',
    providerId: 'openai',
    model: 'gpt-5.4',
    systemPrompt: MARKET_RESEARCHER_SYSTEM_PROMPT,
    builtInToolIds: [
      'web-search',
      'web-fetch',
      'calculator',
      'deep-research',
    ],
  },
  {
    id: 'system-prompt-creator',
    name: 'System Prompt Creator',
    description: 'Creates high-performance system prompts for LLM agents — structured, battle-tested, and failure-resistant.',
    providerId: 'anthropic',
    model: 'claude-opus-4-6',
    systemPrompt: SYSTEM_PROMPT_CREATOR_SYSTEM_PROMPT,
    builtInToolIds: [
      'web-search',
      'web-fetch',
      'deep-research',
    ],
  },
  {
    id: 'humanizer',
    name: 'Humanizer',
    description: 'Rewrites AI-generated or stiff text to sound like a skilled human wrote it — preserves facts, fixes rhythm and voice.',
    providerId: 'anthropic',
    model: 'claude-opus-4-6',
    systemPrompt: HUMANIZER_SYSTEM_PROMPT,
    builtInToolIds: ['web-search', 'web-fetch'],
  },
]

export const DEFAULT_AGENT_TEMPLATE = AGENT_TEMPLATES[0]
export const PROGRAMMER_AGENT_TEMPLATE = AGENT_TEMPLATES[1]
export const MARKET_RESEARCHER_TEMPLATE = AGENT_TEMPLATES[2]
export const SYSTEM_PROMPT_CREATOR_TEMPLATE = AGENT_TEMPLATES[3]
export const HUMANIZER_TEMPLATE = AGENT_TEMPLATES[4]
