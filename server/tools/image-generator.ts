import { tool, jsonSchema } from 'ai'

export function createImageGeneratorTool(apiKey: string) {
  return tool({
    description: 'Generate an image using OpenAI DALL-E / gpt-image-1. Returns a base64-encoded image. Requires an OpenAI API key.',
    parameters: jsonSchema({
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'A detailed description of the image to generate' },
        size: {
          type: 'string',
          enum: ['1024x1024', '1024x1536', '1536x1024'],
          description: 'Image dimensions (default 1024x1024)',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Image quality (default medium)',
        },
      },
      required: ['prompt'],
    }),
    execute: async ({
      prompt,
      size = '1024x1024',
      quality = 'medium',
    }: {
      prompt: string
      size?: string
      quality?: string
    }) => {
      if (!apiKey) {
        return { error: 'OpenAI API key is required for image generation' }
      }

      try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-image-1',
            prompt,
            n: 1,
            size,
            quality,
          }),
        })

        if (!response.ok) {
          const body = await response.text()
          return { error: `OpenAI API error ${response.status}: ${body}` }
        }

        const data = (await response.json()) as {
          data: Array<{ b64_json?: string; url?: string }>
        }
        const image = data.data[0]

        if (image.b64_json) {
          return {
            prompt,
            size,
            quality,
            base64: image.b64_json,
            mimeType: 'image/png',
          }
        } else if (image.url) {
          return {
            prompt,
            size,
            quality,
            url: image.url,
          }
        }

        return { error: 'No image data returned' }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Image generation failed' }
      }
    },
  })
}
