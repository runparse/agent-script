import { ChatCompletionMessageParam, TokenJS, models } from 'token.js';
import { IChatMessage, IChatModel, IChatResponseMetadata } from './types';
import { ChatCompletionError } from './errors';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

export type LLMProvider = keyof typeof models;

export class ChatModel implements IChatModel {
  private client: TokenJS = new TokenJS();

  constructor(
    public options: {
      provider: LLMProvider;
      model: string;
    } & Partial<ChatCompletionCreateParamsNonStreaming> = {
      provider: 'openai',
      model: 'gpt-4o',
    },
  ) {}

  async chatCompletion(
    request: {
      messages: ChatCompletionMessageParam[];
    } & Partial<ChatCompletionCreateParamsNonStreaming>,
  ): Promise<{
    message: IChatMessage;
    metadata: IChatResponseMetadata;
  }> {
    const response = await this.client.chat.completions.create({
      ...this.options,
      ...request,
    });
    const message = response.choices[0]?.message;
    if (!message) {
      throw new ChatCompletionError('No message returned from chat completion');
    }
    const content = message.content || '';
    return {
      message: {
        role: message.role,
        content,
        raw: message,
      },
      metadata: {
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      },
    };
  }

  async chatCompletionWithSchema(
    request: {
      messages: ChatCompletionMessageParam[];
    } & Partial<ChatCompletionCreateParamsNonStreaming>,
  ): Promise<{
    message: IChatMessage;
    metadata: IChatResponseMetadata;
  }> {
    // @ts-ignore
    const responseFormat = request.response_format;
    // @ts-ignore
    if (!['json_schema', 'json_object'].includes(responseFormat?.type)) {
      throw new ChatCompletionError(
        'response_format must be a json_schema or json_object',
      );
    }
    const provider = this.options.provider;
    if (provider === 'anthropic') {
      const dataExtractionTool = {
        name: 'extractDataEntities',
        description: 'Extracts data entities from given content',
        // @ts-ignore
        parameters: responseFormat.json_schema.schema,
      };
      request.tools = [
        {
          function: dataExtractionTool,
          type: 'function',
        },
      ];

      const response = await this.chatCompletion(request);
      const toolCall = response.message.raw?.tool_calls?.[0];
      if (!toolCall) {
        throw new ChatCompletionError(
          'Failed to extract data: no tool call returned from chat completion using Anthropic',
        );
      }
      return {
        message: {
          role: response.message.role,
          content: toolCall.function.arguments,
          raw: response.message.raw,
        },
        metadata: {
          usage: {
            promptTokens: response.metadata.usage.promptTokens,
            completionTokens: response.metadata.usage.completionTokens,
            totalTokens: response.metadata.usage.totalTokens,
          },
        },
      };
    }

    return this.chatCompletion(request);
  }
}
