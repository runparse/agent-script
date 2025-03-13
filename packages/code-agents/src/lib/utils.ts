import { ChatCompletionMessageParam } from 'token.js';
import { IChatMessage } from './types';

export function toChatCompletionMessageParam(
  messages: IChatMessage[],
): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'system':
        return { ...message, role: 'system' };
      case 'user':
        if (message.images) {
          const imageParts = message.images.map(
            (image) =>
              ({
                type: 'image_url',
                image_url: { url: image },
              } as const),
          );
          return {
            role: 'user',
            content: [{ type: 'text', text: message.content }, ...imageParts],
          };
        }
        return { ...message, role: 'user' };
      case 'assistant':
        return { ...message, role: 'assistant' };
      case 'tool-call':
        return {
          ...message,
          role: 'assistant',
          tool_calls: message.toolCalls,
        };
      case 'tool-response':
        return { ...message, role: 'user' };
    }
  });
}

const MAX_LENGTH_TRUNCATE_CONTENT = 10000;

export function truncateContent(
  content: string,
  maxLength: number = MAX_LENGTH_TRUNCATE_CONTENT,
): string {
  if (content.length <= maxLength) {
    return content;
  }

  const halfLength = Math.floor(maxLength / 2);
  return (
    content.slice(0, halfLength) +
    `\n..._This content has been truncated to stay below ${maxLength} characters_...\n` +
    content.slice(-halfLength)
  );
}

export function removeLeadingIndentation(
  content: string,
  excludeFirstNonEmptyLine: boolean = true,
): string {
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const linesToConsider = excludeFirstNonEmptyLine
    ? nonEmptyLines.slice(1)
    : nonEmptyLines;
  const minIndentation = Math.min(
    ...linesToConsider.map((line) => line.match(/^\s*/)?.[0]?.length || 0),
  );

  return lines
    .map((line) =>
      line.startsWith(' '.repeat(minIndentation))
        ? line.slice(minIndentation)
        : line,
    )
    .join('\n');
}
