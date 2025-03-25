import { Kind, TObject, TProperties, Type } from '@sinclair/typebox';
import { TSchema } from '@sinclair/typebox';
import { JSONSchema7 } from 'json-schema';
import { JsonSchemaInstance, JsonSchemaObjectInstance } from './lang';

export function createTSchemaFromJsonSchema(schema: JSONSchema7): TSchema {
  // Handle object type
  if (schema.type === 'object') {
    const properties: Record<string, TSchema> = {};
    if (schema.properties) {
      for (const key in schema.properties) {
        if (Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          const propSchema = schema.properties[key] as JSONSchema7;
          properties[key] = createTSchemaFromJsonSchema(propSchema);
        }
      }
    }
    // Use the required array if provided; default to empty array otherwise.
    const requiredProps = Array.isArray(schema.required) ? schema.required : [];
    return Type.Object(properties, {
      additionalProperties: schema.additionalProperties as boolean,
      required: requiredProps,
    });
  }

  // Handle array type
  if (schema.type === 'array') {
    if (schema.items) {
      return Type.Array(
        createTSchemaFromJsonSchema(schema.items as JSONSchema7),
      );
    }
    // Fallback if no items schema provided.
    return Type.Array(Type.Any());
  }

  // Handle string type (including enums)
  if (schema.type === 'string') {
    if (schema.enum) {
      // Create a union of literal types for each enum value.
      const enumTypes = schema.enum.map((val) => Type.Literal(val as string));
      return Type.Union(enumTypes);
    }
    return Type.String();
  }

  // Handle number or integer type
  if (schema.type === 'number' || schema.type === 'integer') {
    return Type.Number();
  }

  // Handle boolean type
  if (schema.type === 'boolean') {
    return Type.Boolean();
  }

  // Fallback for schemas with no defined type or unsupported types
  return Type.Any();
}

export function createTSchemaFromInstance(
  jsonSchemaInstance: JsonSchemaInstance,
): typeof jsonSchemaInstance & TSchema {
  const typeOfJsonSchemaInstance = typeof jsonSchemaInstance;
  switch (typeOfJsonSchemaInstance) {
    case 'string':
      return Type.String();
    case 'number':
      return Type.Number();
    case 'boolean':
      return Type.Boolean();
    case 'object':
      if (Array.isArray(jsonSchemaInstance)) {
        const firstItem = jsonSchemaInstance[0];
        if (firstItem === undefined) {
          throw new Error('Json schema instance array type cannot be empty');
        }
        if (
          !jsonSchemaInstance.every((item) => typeof item === typeof firstItem)
        ) {
          throw new Error(
            `Invalid json schema instance: array items must be of the same type: ${jsonSchemaInstance
              .map((item) => typeof item)
              .join(', ')}`,
          );
        }
        return Type.Array(createTSchemaFromInstance(firstItem));
      }
      if (jsonSchemaInstance === null) {
        return Type.Null();
      }
      return Type.Object(
        Object.keys(jsonSchemaInstance).reduce((acc, key) => {
          acc[key] = createTSchemaFromInstance(
            (jsonSchemaInstance as JsonSchemaObjectInstance)[key]!,
          );
          return acc;
        }, {} as TProperties),
        {
          additionalProperties: false,
        },
      );
    default:
      throw new Error(
        `Unsupported json schema instance field type: ${typeOfJsonSchemaInstance}`,
      );
  }
}

export function makeTObjectFieldsNullable(schema: TObject): TObject {
  return Type.Object(
    Object.keys(schema.properties).reduce((acc, key) => {
      acc[key] = Type.Union([schema.properties[key] as TSchema, Type.Null()]);
      return acc;
    }, {} as TProperties),
    {
      additionalProperties: false,
    },
  );
}

export function generateDefaultJsonSchemaInstance(
  schema: TSchema,
): JsonSchemaInstance {
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      if (schema.items) {
        // Handle array type
        return [generateDefaultJsonSchemaInstance(schema.items as TSchema)];
      }
      // Handle object type
      return Object.keys(schema.properties || {}).reduce((acc, key) => {
        acc[key] = generateDefaultJsonSchemaInstance(
          (schema.properties as Record<string, TSchema>)[key]!,
        );
        return acc;
      }, {} as Record<string, JsonSchemaInstance>);
    case 'array':
      return [generateDefaultJsonSchemaInstance(schema.items as TSchema)];
    case 'null':
      throw new Error(`Unsupported schema type: ${JSON.stringify(schema)}`);
    default:
      switch (schema[Kind]) {
        case 'Union':
          return generateDefaultJsonSchemaInstance(schema.anyOf[0] as TSchema);
        default:
          throw new Error(`Unsupported schema type: ${JSON.stringify(schema)}`);
      }
  }
}
