import { ChatCompletionMessageParam } from 'token.js';
import { IChatMessage, Observation } from './types';
import {
  TObject,
  TSchema,
  Hint,
  TEnum,
  TArray,
  Type,
  TUnion,
  Kind,
} from '@sinclair/typebox';

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
    }
  });
}

export function observationToChatMessage(
  observation: Observation,
): IChatMessage {
  const source = observation.source ? `\nSource: ${observation.source}` : '';
  const context = observation.context
    ? `\nContext: ${observation.context}`
    : '';
  if (observation.type === 'text') {
    return {
      role: 'user',
      content: `Observation:\n${observation.text}${context}${source}`,
    };
  }
  return {
    role: 'user',
    content: `Observation Image:${context}${source}`,
    images: [observation.image],
  };
}

export const MAX_LENGTH_TRUNCATE_CONTENT = 2000;

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
    `\n\n-- Content has been truncated to be below ${maxLength} characters --\n\n` +
    content.slice(-halfLength)
  );
}

export function truncateContentTail(
  content: string,
  maxLength: number = MAX_LENGTH_TRUNCATE_CONTENT,
): string {
  if (content.length <= maxLength) {
    return content;
  }

  return content.slice(0, maxLength) + ' ... (truncated)';
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

export function schemaToTypeString(schema: TSchema): string {
  // Handle literal types (if a constant is provided)
  if ('const' in schema) {
    return JSON.stringify((schema as any).const);
  }

  const descriptionComment = schema.description
    ? ` // ${schema.description}`
    : '';

  // Handle objects recursively
  if (schema.type === 'object') {
    const objSchema = schema as TObject;
    const lines = Object.entries(objSchema.properties).map(([key, value]) => {
      // Check if the property is optional.
      const isOptional = !objSchema.required?.includes(key);
      return `${key}${isOptional ? '?' : ''}: ${schemaToTypeString(value)}`;
    });
    return `{\n  ${lines.join('\n  ')}\n}`;
  }

  // Handle arrays recursively
  if (schema.type === 'array') {
    const arraySchema = schema as any;
    return `Array<${schemaToTypeString(
      arraySchema.items,
    )}>${descriptionComment}`;
  }

  switch (schema[Kind]) {
    case 'Any':
      return `any;${descriptionComment}`;
    case 'Union':
      return `// ${(schema as TUnion).anyOf
        .map((o) => o.const)
        .join(' | ')};${descriptionComment}`;
    default:
      break;
  }

  switch (schema[Hint]) {
    case 'Enum':
      return `// ${(schema as TEnum).anyOf
        .map((o) => o.const)
        .join(' | ')};${descriptionComment}`;
  }

  // Handle primitive types
  switch (schema.type) {
    case 'string':
      return `string;${descriptionComment}`;
    case 'number':
      return `number;${descriptionComment}`;
    case 'integer': // Treat integer as number
      return `number;${descriptionComment}`;
    case 'boolean':
      return `boolean;${descriptionComment}`;
    case 'null':
      return `null;${descriptionComment}`;
  }
  return `unknown;${descriptionComment}`;
}

export function walkTypeboxSchema(
  schema: TSchema,
  callback: (schema: TSchema, schemaPath: string) => void,
  schemaPath: string = '',
) {
  // Process schema based on its type
  if (schema.type === 'object') {
    const objSchema = schema as TObject;
    if (objSchema.properties) {
      Object.entries(objSchema.properties).forEach(([key, value]) =>
        walkTypeboxSchema(value, callback, `${schemaPath}.${key}`),
      );
    }
  } else if (schema.type === 'array') {
    const arraySchema = schema as TArray;
    if (arraySchema.items) {
      walkTypeboxSchema(arraySchema.items, callback, schemaPath);
    }
  } else if (
    schema.type === 'string' ||
    schema.type === 'number' ||
    schema.type === 'integer' ||
    schema.type === 'boolean' ||
    schema.type === 'null'
  ) {
    callback(schema, schemaPath);
  }
}

export function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const mapped = obj.map((item) => stableStringify(item));
    return `[${mapped.join(',')}]`;
  }

  // For plain objects, sort the keys to ensure consistent order
  const sortedKeys = Object.keys(obj).sort();
  const keyValuePairs = sortedKeys.map((key) => {
    return `${JSON.stringify(key)}:${stableStringify(obj[key])}`;
  });
  return `{${keyValuePairs.join(',')}}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(decimals))} ${
    sizes[i]
  }`;
}

export function createTSchemaFromType(type: string): TSchema {
  switch (type) {
    case 'string':
      return Type.String();
    case 'number':
      return Type.Number();
    case 'boolean':
      return Type.Boolean();
    case 'null':
      return Type.Null();
    default:
      return Type.Any();
  }
}
