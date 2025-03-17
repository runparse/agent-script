import { ChatCompletionMessageParam, TokenJS } from 'token.js';
import { CompletionNonStreaming, LLMProvider } from 'token.js/dist/chat';
import { IChatMessage, IChatModel, IChatResponseMetadata } from './types';
import { ChatCompletionError } from './errors';

export class ChatModel implements IChatModel {
  private client: TokenJS = new TokenJS();

  constructor(
    public options: {
      provider: LLMProvider;
      model: string;
    } & Partial<CompletionNonStreaming<LLMProvider>> = {
      provider: 'openai',
      model: 'gpt-4o',
    },
  ) {}

  async chatCompletion<P extends LLMProvider>(
    request: {
      messages: ChatCompletionMessageParam[];
    } & Partial<CompletionNonStreaming<P>>,
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
}
