import { Type, TSchema, Static, TArray, TObject } from '@sinclair/typebox';
import { IChatModel, ICodeAgent } from '../types';
import { BaseUdf } from './baseUdf';
import { ChatModel } from '../chatModel';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { createTSchemaFromType, schemaToTypeString } from '../utils';

const itemPropertiesSchema = Type.Array(
  Type.Object(
    {
      name: Type.String({ description: 'Property name' }),
      description: Type.String({
        description: 'Property description',
      }),
      dataType: Type.Union([
        Type.Literal('string'),
        Type.Literal('number'),
        Type.Literal('boolean'),
        Type.Literal('null'),
      ]),
    },
    {
      additionalProperties: false,
      description:
        'The schema for the properties to extract from the input. Maximum of 5 properties allowed.',
    },
  ),
);

export class AnalyzeListUdf extends BaseUdf {
  name = 'analyzeList';
  description = `Perform a analytical task on a list of items and extract properties on each item. Follow these rules:
- properties should be transformative, do not create properties for information already present in a plain way in the input list
- the input list should contain as much relevant information from the original data as possible
- properties should be a single value, not a list
- only include properties whose values are shorter than 100 characters`;

  inputSchema = Type.Object(
    {
      inputList: Type.Array(Type.Any(), {
        description: 'A list of items to analyze',
      }),
      itemProperties: itemPropertiesSchema,
      instructions: Type.Optional(
        Type.String({
          description: 'Additional instructions on the analysis',
        }),
      ),
    },
    { default: { columns: [] } },
  );

  outputSchema: TArray<TObject> = Type.Array(
    Type.Object(
      {},
      {
        description:
          'An object with the properties defined in itemPropertiesSchema',
      },
    ),
  );

  private model: IChatModel;

  constructor(options?: { model?: IChatModel }) {
    super();
    this.model =
      options?.model ||
      new ChatModel({
        provider: 'openai',
        model: 'o3-mini',
      });
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const itemPropertiesWithIndex = input.itemProperties.some(
      (property) =>
        property.name.includes('i') ||
        property.name.includes('index') ||
        property.name.includes('id') ||
        property.name.includes('idx'),
    )
      ? input.itemProperties
      : [
          ...input.itemProperties,
          {
            name: 'index',
            dataType: 'number',
            description:
              'The item number or index as indicated in the input list',
          },
        ];

    this.outputSchema = Type.Array(
      Type.Object(
        Object.fromEntries(
          itemPropertiesWithIndex.map((property) => [
            property.name,
            createTSchemaFromType(property.dataType),
          ]),
        ),
        { additionalProperties: false },
      ),
    );

    const response = await this.model.chatCompletionWithSchema(
      getDataExtractionPrompt(
        input.inputList,
        itemPropertiesWithIndex,
        Type.Object(
          {
            data: this.outputSchema,
          },
          { additionalProperties: false },
        ),
      ),
    );

    return JSON.parse(response.message.content).data;
  }
}

function getDataExtractionPrompt(
  list: any[],
  itemProperties: Static<TSchema>,
  schema?: TSchema,
): ChatCompletionCreateParamsNonStreaming {
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant. You are given a list of text items. Your goal is to extract properties about each item as defined by the following schema: ${JSON.stringify(
        itemProperties,
      )}.
Ground rules:
- The output data list must have the same length as the input list: (${
        list.length
      })
- The maximum length for any property value is 100 characters
- ${
        schema
          ? `Your output must be a valid JSON object that matches the typescript type ${schemaToTypeString(
              schema.properties.data,
            )}.`
          : 'Your output must be a valid JSON object'
      }. `,
    },
    {
      role: 'user',
      content:
        'Analyze the following list of items and return the properties as defined by the schema',
    },
    {
      role: 'user',
      content: list
        .map((item, i) => `- Item ${i}: ${JSON.stringify(item)}`)
        .join('\n'),
    },
  ];

  const responseFormatSchemaConfig = {
    type: 'json_schema',
    json_schema: {
      name: 'analyze_list_response',
      strict: true,
      schema,
    },
  };

  return {
    // @ts-ignore outdated openai version in token.js
    messages,
    stream: false,
    // @ts-ignore outdated openai version in token.js
    response_format: schema
      ? responseFormatSchemaConfig
      : { type: 'json_object' },
  };
}
