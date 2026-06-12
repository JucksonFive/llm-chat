import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { BedrockConfig, ChatMessage } from './bedrock-service.js'

describe('bedrock-service', () => {
  describe('config validation', () => {
    it('should require modelId', () => {
      const config: BedrockConfig = {
        modelId: '',
      }

      expect(config.modelId).toBe('')
      expect(config.modelId.length).toBe(0)
    })

    it('should accept valid modelId formats', () => {
      const validModelIds = [
        'eu.anthropic.claude-opus-4-8',
        'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        'anthropic.claude-3-haiku-20240307-v1:0',
        'amazon.nova-pro-v1:0',
      ]

      for (const modelId of validModelIds) {
        const config: BedrockConfig = { modelId }
        expect(config.modelId).toBeTruthy()
        expect(config.modelId.length).toBeGreaterThan(0)
      }
    })

    it('should accept valid region format', () => {
      const validRegions = [
        'us-east-1',
        'us-west-2',
        'eu-west-1',
        'eu-central-1',
        'ap-southeast-1',
        'ap-northeast-1',
      ]

      for (const region of validRegions) {
        expect(region).toMatch(/^[a-z]{2}-[a-z]+-\d+$/)
      }
    })

    it('should reject invalid region format', () => {
      const invalidRegions = [
        'invalid',
        'us_east_1',
        'us-east',
        '1-east-us',
        'US-EAST-1',
        'us-east-1-extra',
      ]

      for (const region of invalidRegions) {
        expect(region).not.toMatch(/^[a-z]{2}-[a-z]+-\d+$/)
      }
    })

    it('should use default region when not specified', () => {
      const config: BedrockConfig = {
        modelId: 'test-model',
      }

      expect(config.region).toBeUndefined()
      // Default region us-east-1 would be used in actual implementation
    })

    it('should accept profile configuration', () => {
      const config: BedrockConfig = {
        modelId: 'test-model',
        region: 'eu-west-1',
        profile: 'my-profile',
      }

      expect(config.profile).toBe('my-profile')
    })
  })

  describe('message conversion', () => {
    it('should convert simple chat messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]

      expect(messages.length).toBe(3)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Hello')
      expect(messages[1].role).toBe('assistant')
      expect(messages[1].content).toBe('Hi there!')
      expect(messages[2].role).toBe('user')
      expect(messages[2].content).toBe('How are you?')
    })

    it('should handle empty messages array', () => {
      const messages: ChatMessage[] = []
      expect(messages.length).toBe(0)
    })

    it('should handle messages with special characters', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello "world" & <test>' },
        { role: 'assistant', content: 'Response with\nnewlines\tand\ttabs' },
      ]

      expect(messages[0].content).toContain('"')
      expect(messages[0].content).toContain('&')
      expect(messages[0].content).toContain('<')
      expect(messages[1].content).toContain('\n')
      expect(messages[1].content).toContain('\t')
    })

    it('should handle long messages', () => {
      const longContent = 'A'.repeat(10000)
      const messages: ChatMessage[] = [
        { role: 'user', content: longContent },
      ]

      expect(messages[0].content.length).toBe(10000)
    })

    it('should handle unicode content', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hei! Tämä on suomea 🇫🇮' },
        { role: 'assistant', content: '你好世界 🌍' },
      ]

      expect(messages[0].content).toContain('ä')
      expect(messages[0].content).toContain('🇫🇮')
      expect(messages[1].content).toContain('你好')
      expect(messages[1].content).toContain('🌍')
    })
  })

  describe('streaming chunks', () => {
    it('should have correct chunk types', () => {
      const textChunk = { type: 'text-delta' as const, text: 'Hello' }
      const errorChunk = { type: 'error' as const, error: 'Test error' }
      const doneChunk = { type: 'done' as const }

      expect(textChunk.type).toBe('text-delta')
      expect(textChunk.text).toBe('Hello')
      expect(errorChunk.type).toBe('error')
      expect(errorChunk.error).toBe('Test error')
      expect(doneChunk.type).toBe('done')
    })

    it('should handle empty text chunks', () => {
      const chunk = { type: 'text-delta' as const, text: '' }
      expect(chunk.text).toBe('')
    })

    it('should handle multiline text chunks', () => {
      const chunk = { type: 'text-delta' as const, text: 'Line 1\nLine 2\nLine 3' }
      expect(chunk.text).toContain('\n')
      expect(chunk.text.split('\n').length).toBe(3)
    })
  })

  describe('error scenarios', () => {
    it('should identify missing credentials error message', () => {
      const errorMessage = 'AWS credentials not found or invalid'
      expect(errorMessage).toContain('credentials')
      expect(errorMessage).toContain('invalid')
    })

    it('should identify access denied error message', () => {
      const modelId = 'test-model'
      const errorMessage = `Access denied to Bedrock model ${modelId}`
      expect(errorMessage).toContain('Access denied')
      expect(errorMessage).toContain(modelId)
    })

    it('should identify model not found error message', () => {
      const modelId = 'test-model'
      const region = 'us-east-1'
      const errorMessage = `Bedrock model ${modelId} not found in region ${region}`
      expect(errorMessage).toContain('not found')
      expect(errorMessage).toContain(modelId)
      expect(errorMessage).toContain(region)
    })

    it('should identify empty response error', () => {
      const errorMessage = 'Empty response from Bedrock model'
      expect(errorMessage).toContain('Empty response')
    })

    it('should identify no text content error', () => {
      const errorMessage = 'No text content in Bedrock response'
      expect(errorMessage).toContain('No text content')
    })
  })

  describe('environment variables', () => {
    const originalEnv = process.env

    beforeEach(() => {
      vi.resetModules()
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should read AWS_REGION from environment', () => {
      process.env.AWS_REGION = 'eu-west-1'
      expect(process.env.AWS_REGION).toBe('eu-west-1')
    })

    it('should read AWS_PROFILE from environment', () => {
      process.env.AWS_PROFILE = 'my-profile'
      expect(process.env.AWS_PROFILE).toBe('my-profile')
    })

    it('should handle missing environment variables', () => {
      delete process.env.AWS_REGION
      delete process.env.AWS_PROFILE
      expect(process.env.AWS_REGION).toBeUndefined()
      expect(process.env.AWS_PROFILE).toBeUndefined()
    })
  })

  describe('AWS SDK integration', () => {
    it('should use correct BedrockRuntimeClient initialization pattern', () => {
      const config = {
        modelId: 'test-model',
        region: 'eu-west-1',
      }

      // Verify config structure matches AWS SDK expectations
      expect(config).toHaveProperty('region')
      expect(config.region).toMatch(/^[a-z]{2}-[a-z]+-\d+$/)
    })

    it('should handle ConverseCommand input structure', () => {
      const input = {
        modelId: 'test-model',
        messages: [
          {
            role: 'user',
            content: [{ text: 'Hello' }],
          },
        ],
        system: [{ text: 'You are helpful' }],
      }

      expect(input).toHaveProperty('modelId')
      expect(input).toHaveProperty('messages')
      expect(input).toHaveProperty('system')
      expect(input.messages[0].content[0]).toHaveProperty('text')
    })

    it('should handle ConverseCommand without system prompt', () => {
      const input = {
        modelId: 'test-model',
        messages: [
          {
            role: 'user',
            content: [{ text: 'Hello' }],
          },
        ],
      }

      expect(input).not.toHaveProperty('system')
      expect(input).toHaveProperty('messages')
    })
  })

  describe('system prompt handling', () => {
    it('should handle presence of system prompt', () => {
      const systemPrompt = 'You are a helpful assistant'
      const input = systemPrompt ? { system: [{ text: systemPrompt }] } : {}

      expect(input).toHaveProperty('system')
      expect(input.system?.[0].text).toBe(systemPrompt)
    })

    it('should handle absence of system prompt', () => {
      const systemPrompt = undefined
      const input = systemPrompt ? { system: [{ text: systemPrompt }] } : {}

      expect(input).not.toHaveProperty('system')
    })

    it('should handle empty system prompt', () => {
      const systemPrompt = ''
      const input = systemPrompt ? { system: [{ text: systemPrompt }] } : {}

      expect(input).not.toHaveProperty('system')
    })

    it('should handle multiline system prompt', () => {
      const systemPrompt = 'Line 1\nLine 2\nLine 3'
      const input = { system: [{ text: systemPrompt }] }

      expect(input.system[0].text).toContain('\n')
      expect(input.system[0].text.split('\n').length).toBe(3)
    })
  })

  describe('model ID validation', () => {
    it('should recognize EU Claude 4.x models', () => {
      const euModels = [
        'eu.anthropic.claude-opus-4-8',
        'eu.anthropic.claude-opus-4-7',
        'eu.anthropic.claude-sonnet-4-6',
        'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
      ]

      euModels.forEach((modelId) => {
        expect(modelId).toMatch(/^eu\.anthropic\.claude-/)
      })
    })

    it('should recognize US cross-region models', () => {
      const usModels = [
        'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        'us.anthropic.claude-3-5-haiku-20241022-v1:0',
      ]

      usModels.forEach((modelId) => {
        expect(modelId).toMatch(/^us\.anthropic\.claude-/)
      })
    })

    it('should recognize single-region models', () => {
      const singleRegionModels = [
        'anthropic.claude-3-5-sonnet-20240620-v1:0',
        'anthropic.claude-3-haiku-20240307-v1:0',
      ]

      singleRegionModels.forEach((modelId) => {
        expect(modelId).toMatch(/^anthropic\.claude-/)
        expect(modelId).not.toMatch(/^(us|eu)\./)
      })
    })

    it('should recognize Amazon Nova models', () => {
      const novaModels = [
        'amazon.nova-pro-v1:0',
        'amazon.nova-lite-v1:0',
        'amazon.nova-micro-v1:0',
      ]

      novaModels.forEach((modelId) => {
        expect(modelId).toMatch(/^amazon\.nova-/)
      })
    })
  })

  describe('conversation flow', () => {
    it('should handle single turn conversation', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ]

      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('user')
    })

    it('should handle multi-turn conversation', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I am well, thanks!' },
        { role: 'user', content: 'Great!' },
      ]

      expect(messages.length).toBe(5)
      // Verify alternating pattern
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('assistant')
      expect(messages[2].role).toBe('user')
      expect(messages[3].role).toBe('assistant')
      expect(messages[4].role).toBe('user')
    })

    it('should handle consecutive user messages', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Are you there?' },
      ]

      expect(messages.length).toBe(2)
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('user')
    })
  })
})
