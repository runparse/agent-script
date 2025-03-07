import { TObject, TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  createTSchemaFromInstance,
  createTSchemaFromJsonSchema,
  makeTObjectFieldsNullable,
  generateDefaultJsonSchemaInstance,
} from './tSchemaUtils';
import { Json, JsonSchemaInstance } from './types';
import { JSONSchema7 } from 'json-schema';

export class TObjectWrapper {
  static WRAPPER_KEY = '_wrapper';
  public wrapped = false;
  public tSchema: TObject;

  constructor(
    tSchemaOriginal: TSchema,
    public jsonSchemaInstance?: JsonSchemaInstance,
  ) {
    if (tSchemaOriginal.type !== 'object') {
      this.wrapped = true;
      this.tSchema = Type.Object(
        { [TObjectWrapper.WRAPPER_KEY]: tSchemaOriginal },
        {
          additionalProperties: false,
        },
      );
    } else {
      this.tSchema = tSchemaOriginal as TObject;
    }

    if (!this.jsonSchemaInstance) {
      this.jsonSchemaInstance = generateDefaultJsonSchemaInstance(this.tSchema);
    }
  }

  static fromJsonSchemaInstance(jsonSchemaInstance: JsonSchemaInstance) {
    const tObjectWrapper = new TObjectWrapper(
      createTSchemaFromInstance(jsonSchemaInstance),
      jsonSchemaInstance,
    );
    return tObjectWrapper;
  }

  static fromJsonSchema(jsonSchema: JSONSchema7) {
    const tObjectWrapper = new TObjectWrapper(
      createTSchemaFromJsonSchema(jsonSchema),
    );
    return tObjectWrapper;
  }

  nullable() {
    this.tSchema = makeTObjectFieldsNullable(this.tSchema);
    return this;
  }

  getData(data: Json): JsonSchemaInstance | undefined {
    if (Value.Check(this.tSchema, data)) {
      return this.wrapped ? (data as any)[TObjectWrapper.WRAPPER_KEY] : data;
    }
    return undefined;
  }
}
