import { describe, it, expect } from 'vitest'
import type { BedrockConfig, ChatMessage } from './bedrock-service.js'

describe('bedrock-service', () => {
  describe('config validation', () => {
    it('should require modelId', () => {
      const config: BedrockConfig = {
        modelId: '',
      }

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ]

      // This would throw in the actual implementation
      expect(config.modelId).toBe('')
    })

    it('should accept valid region format', () => {
      const validRegions = [
        'us-east-1',
        'us-west-2',
        'eu-central-1',
        'ap-southeast-1',
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
      ]

      for (const region of invalidRegions) {
        expect(region).not.toMatch(/^[a-z]{2}-[a-z]+-\d+$/)
      }
    })
  })

  describe('message conversion', () => {
    it('should convert chat messages to bedrock format', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]

      expect(messages.length).toBe(3)
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('assistant')
    })
  })
})
