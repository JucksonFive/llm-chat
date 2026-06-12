import type { ProviderId, ProviderMeta } from '@/types'

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini', 'o3-mini'],
    icon: 'Brain',
    color: '#10a37f',
    requiresApiKey: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514'],
    icon: 'Sparkles',
    color: '#d4a574',
    requiresApiKey: true,
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    models: ['gemini-3.1-pro-preview', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    icon: 'Gem',
    color: '#4285f4',
    requiresApiKey: true,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    models: ['llama3.1', 'mistral', 'codellama', 'gemma2'],
    icon: 'HardDrive',
    color: '#a855f7',
    requiresApiKey: false,
    freeTextModel: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    icon: 'Waves',
    color: '#4d6bfe',
    requiresApiKey: true,
  },
  bedrock: {
    id: 'bedrock',
    name: 'AWS Bedrock',
    models: [
      'eu.anthropic.claude-opus-4-8',
      'eu.anthropic.claude-opus-4-7',
      'eu.anthropic.claude-sonnet-4-6',
      'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
    ],
    icon: 'Cloud',
    color: '#ff9900',
    requiresApiKey: false, // AWS credentials are optional - falls back to server's AWS config
  },
}

export const PROVIDER_LIST = Object.values(PROVIDERS)

export const AVATAR_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]
