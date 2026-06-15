import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type ContentBlock,
  type ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'

export interface BedrockConfig {
  region?: string
  profile?: string
  modelId: string
  accessKeyId?: string
  secretAccessKey?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BedrockStreamChunk {
  type: 'text-delta' | 'error' | 'done' | 'tool-use' | 'tool-result'
  text?: string
  error?: string
  toolUseId?: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

function createBedrockClient(config: BedrockConfig): BedrockRuntimeClient {
  const { region, profile, accessKeyId, secretAccessKey } = config
  const effectiveRegion = region || process.env.AWS_REGION || 'us-east-1'

  // If explicit credentials are provided, use them
  if (accessKeyId && secretAccessKey) {
    return new BedrockRuntimeClient({
      region: effectiveRegion,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  }

  // Otherwise, fall back to profile or default AWS credentials chain
  if (profile) {
    process.env.AWS_PROFILE = profile
  }

  return new BedrockRuntimeClient({ region: effectiveRegion })
}

function convertToChatMessages(messages: ChatMessage[]): BedrockMessage[] {
  return messages.map((msg) => {
    const content: ContentBlock[] = [{ text: msg.content }]
    return {
      role: msg.role,
      content,
    }
  })
}

/** Build the Bedrock toolConfig from our tool definitions. */
function buildToolConfig(tools?: BedrockTool[]): ToolConfiguration | undefined {
  if (!tools || tools.length === 0) return undefined
  return {
    tools: tools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: tool.inputSchema,
        },
      },
    } as Tool)),
  }
}

function validateConfig(config: BedrockConfig): void {
  if (!config.modelId) {
    throw new Error('BEDROCK_MODEL_ID is required. Set it in your environment variables.')
  }

  const region = config.region || process.env.AWS_REGION
  if (region && !/^[a-z]{2}-[a-z]+-\d+$/.test(region)) {
    throw new Error(`Invalid AWS region format: ${region}. Expected format like "us-east-1".`)
  }
}

export async function askBedrock(
  config: BedrockConfig,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  validateConfig(config)

  const client = createBedrockClient(config)
  const bedrockMessages = convertToChatMessages(messages)

  const input = {
    modelId: config.modelId,
    messages: bedrockMessages,
    ...(systemPrompt && {
      system: [{ text: systemPrompt }],
    }),
  }

  try {
    const command = new ConverseCommand(input)
    const response = await client.send(command)

    if (!response.output?.message?.content) {
      throw new Error('Empty response from Bedrock model')
    }

    const textBlocks = response.output.message.content
      .filter((block) => 'text' in block)
      .map((block) => block.text)
      .filter(Boolean)

    if (textBlocks.length === 0) {
      throw new Error('No text content in Bedrock response')
    }

    return textBlocks.join('')
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('UnrecognizedClientException')) {
        throw new Error(
          'AWS credentials not found or invalid. Make sure AWS_PROFILE is set or credentials are configured.'
        )
      }
      if (error.message.includes('AccessDeniedException')) {
        throw new Error(
          `Access denied to Bedrock model ${config.modelId}. Check IAM permissions and model access in AWS console.`
        )
      }
      if (error.message.includes('ResourceNotFoundException')) {
        throw new Error(
          `Bedrock model ${config.modelId} not found in region ${config.region || 'us-east-1'}. Check model ID and region.`
        )
      }
      throw error
    }
    throw new Error('Unknown error calling Bedrock')
  }
}

export async function* streamBedrock(
  config: BedrockConfig,
  messages: ChatMessage[],
  systemPrompt?: string,
  tools?: BedrockTool[]
): AsyncGenerator<BedrockStreamChunk> {
  validateConfig(config)

  const client = createBedrockClient(config)
  const bedrockMessages = convertToChatMessages(messages)
  const toolConfig = buildToolConfig(tools)

  const input = {
    modelId: config.modelId,
    messages: bedrockMessages,
    ...(systemPrompt && {
      system: [{ text: systemPrompt }],
    }),
    ...(toolConfig && { toolConfig }),
  }

  try {
    const command = new ConverseStreamCommand(input)
    const response = await client.send(command)

    if (!response.stream) {
      throw new Error('No stream returned from Bedrock')
    }

    let currentToolUseId: string | undefined
    let currentToolName: string | undefined
    let currentToolInput = ''

    for await (const event of response.stream) {
      const chunk = event as ConverseStreamOutput

      // Handle text content
      if (chunk.contentBlockDelta?.delta?.text) {
        yield {
          type: 'text-delta',
          text: chunk.contentBlockDelta.delta.text,
        }
      }

      // Handle tool use start
      if (chunk.contentBlockStart?.start?.toolUse) {
        const toolUse = chunk.contentBlockStart.start.toolUse
        currentToolUseId = toolUse.toolUseId
        currentToolName = toolUse.name
        currentToolInput = ''
      }

      // Handle tool use input delta
      if (chunk.contentBlockDelta?.delta?.toolUse?.input) {
        currentToolInput += chunk.contentBlockDelta.delta.toolUse.input
      }

      // Handle tool use stop (complete)
      if (chunk.contentBlockStop && currentToolUseId && currentToolName) {
        try {
          const parsedInput = currentToolInput ? JSON.parse(currentToolInput) : {}
          yield {
            type: 'tool-use',
            toolUseId: currentToolUseId,
            toolName: currentToolName,
            toolInput: parsedInput,
          }
        } catch (parseError) {
          yield {
            type: 'error',
            error: `Failed to parse tool input: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          }
        }
        // Reset for next tool
        currentToolUseId = undefined
        currentToolName = undefined
        currentToolInput = ''
      }

      if (chunk.internalServerException || chunk.modelStreamErrorException) {
        const errorMsg =
          chunk.internalServerException?.message ||
          chunk.modelStreamErrorException?.message ||
          'Stream error from Bedrock'

        yield {
          type: 'error',
          error: errorMsg,
        }
        return
      }
    }

    yield { type: 'done' }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('UnrecognizedClientException')) {
        yield {
          type: 'error',
          error:
            'AWS credentials not found or invalid. Make sure AWS_PROFILE is set or credentials are configured.',
        }
        return
      }
      if (error.message.includes('AccessDeniedException')) {
        yield {
          type: 'error',
          error: `Access denied to Bedrock model ${config.modelId}. Check IAM permissions and model access.`,
        }
        return
      }
      if (error.message.includes('ResourceNotFoundException')) {
        yield {
          type: 'error',
          error: `Bedrock model ${config.modelId} not found. Check model ID and region.`,
        }
        return
      }
      yield {
        type: 'error',
        error: error.message,
      }
      return
    }
    yield {
      type: 'error',
      error: 'Unknown error streaming from Bedrock',
    }
  }
}
