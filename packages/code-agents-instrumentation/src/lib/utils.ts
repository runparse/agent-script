import { ChatCompletionMessageParam } from 'token.js';

export function transformChatRequestMessages(
  messages: ChatCompletionMessageParam[],
  options: {
    omitImageData: boolean;
  } = {
    omitImageData: true,
  },
): any[] {
  return messages.map((message) => {
    if (!options.omitImageData) {
      return message;
    }
    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((part) => {
          if (part.type === 'image_url') {
            return {
              ...part,
              image_url: {
                url: `data:image/jpeg;base64,...(omitted)`,
              },
            };
          }
          return part;
        }),
      };
    }
    return message;
  });
}
