import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import { Attributes } from '@opentelemetry/api';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

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

export function getLLMInputMessagesAttributes(
  body: ChatCompletionCreateParamsNonStreaming,
): Attributes {
  return body.messages.reduce(
    (acc: Attributes, message: ChatCompletionMessageParam, index: number) => {
      const messageAttributes =
        getChatCompletionInputMessageAttributes(message);
      const indexPrefix = `${SemanticConventions.LLM_INPUT_MESSAGES}.${index}.`;
      // Flatten the attributes on the index prefix
      for (const [key, value] of Object.entries(messageAttributes)) {
        acc[`${indexPrefix}${key}`] = value;
      }
      return acc;
    },
    {} as Attributes,
  );
}

function getChatCompletionInputMessageAttributes(
  message: ChatCompletionMessageParam,
): Attributes {
  const role = message.role;
  const attributes: Attributes = {
    [SemanticConventions.MESSAGE_ROLE]: role,
  };
  // Add the content only if it is a string
  if (typeof message.content === 'string') {
    attributes[SemanticConventions.MESSAGE_CONTENT] = message.content;
  } else if (Array.isArray(message.content)) {
    message.content.forEach((part, index) => {
      const contentsIndexPrefix = `${SemanticConventions.MESSAGE_CONTENTS}.${index}.`;
      if (part.type === 'text') {
        attributes[
          `${contentsIndexPrefix}${SemanticConventions.MESSAGE_CONTENT_TYPE}`
        ] = 'text';
        attributes[
          `${contentsIndexPrefix}${SemanticConventions.MESSAGE_CONTENT_TEXT}`
        ] = part.text;
      } else if (part.type === 'image_url') {
        attributes[
          `${contentsIndexPrefix}${SemanticConventions.MESSAGE_CONTENT_TYPE}`
        ] = 'image';
        attributes[
          `${contentsIndexPrefix}${SemanticConventions.MESSAGE_CONTENT_IMAGE}.${SemanticConventions.IMAGE_URL}`
        ] = part.image_url.url;
      }
    });
  }
  switch (role) {
    case 'user':
      // There's nothing to add for the user
      break;
    case 'assistant':
      if (message.tool_calls) {
        message.tool_calls.forEach((toolCall, index) => {
          const toolCallIndexPrefix = `${SemanticConventions.MESSAGE_TOOL_CALLS}.${index}.`;

          // Add the tool call id if it exists
          if (toolCall.id) {
            attributes[
              `${toolCallIndexPrefix}${SemanticConventions.TOOL_CALL_ID}`
            ] = toolCall.id;
          }
          // Make sure the tool call has a function
          if (toolCall.function) {
            attributes[
              `${toolCallIndexPrefix}${SemanticConventions.TOOL_CALL_FUNCTION_NAME}`
            ] = toolCall.function.name;
            attributes[
              `${toolCallIndexPrefix}${SemanticConventions.TOOL_CALL_FUNCTION_ARGUMENTS_JSON}`
            ] = toolCall.function.arguments;
          }
        });
      }
      break;
    case 'function':
      attributes[SemanticConventions.MESSAGE_FUNCTION_CALL_NAME] = message.name;
      break;
    case 'tool':
      if (message.tool_call_id) {
        attributes[`${SemanticConventions.MESSAGE_TOOL_CALL_ID}`] =
          message.tool_call_id;
      }
      break;
    case 'system':
      // There's nothing to add for the system. Content is captured above
      break;
    default:
      break;
  }
  return attributes;
}
