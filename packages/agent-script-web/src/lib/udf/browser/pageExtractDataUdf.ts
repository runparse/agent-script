import { Type, TSchema, Static } from '@sinclair/typebox';
import { PageUdf } from './pageUdf';
import {
  IChatModel,
  schemaToTypeString,
  ChatModel,
} from '@runparse/agent-script';
import TurndownService from 'turndown';
import { IWebAgent } from '../../types';
import { Parser } from 'htmlparser2';
import { getBase64Screenshot } from './utils';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
export class PageExtractDataUdf extends PageUdf {
  name = 'pageExtractData';
  description =
    'Extracts data from current webpage you are on, following user instructions';

  inputSchema = Type.Object(
    {
      instructions: Type.String({
        description:
          'Describe the type of data you want to extract from the webpage',
      }),
    },
    { default: { instructions: 'string' } },
  );
  outputSchema: TSchema;
  private wrappedOutputSchema: TSchema;

  private model: IChatModel;

  private visualMode: boolean = false;

  constructor({
    objectSchema: objectSchema,
    model,
    visualMode = false,
  }: {
    objectSchema: TSchema;
    model?: IChatModel;
    visualMode?: boolean;
  }) {
    super();
    this.model =
      model ||
      new ChatModel({
        provider: 'openai',
        model: 'gpt-4o',
      });

    this.visualMode = visualMode;
    if (objectSchema.type !== 'object') {
      throw new Error('outputSchema must be an object');
    }
    this.outputSchema = Type.Array(objectSchema);
    this.wrappedOutputSchema = Type.Object(
      {
        data: this.outputSchema,
      },
      { additionalProperties: false },
    );
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IWebAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const content = await agent.page.content();

    const bodyMarkdown = getBodyMarkdown(content);

    const response = await this.model.chatCompletionWithSchema(
      getDataExtractionPrompt(
        bodyMarkdown,
        this.visualMode
          ? (
              await getBase64Screenshot(agent.page)
            ).data
          : undefined,
        this.wrappedOutputSchema,
        input.instructions,
      ),
    );

    return JSON.parse(response.message.content).data;
  }

  override async onAfterCall(
    input: Static<typeof this.inputSchema>,
    output: Static<typeof this.outputSchema>,
    agent: IWebAgent,
  ) {
    await super.onAfterCall(input, output, agent);
    const historyItem = agent.navigationHistory
      .reverse()
      .find((item) => item.url === agent.page.url());
    if (historyItem) {
      historyItem.dataExtraction = { data: output };
    }
  }
}

function getDataExtractionPrompt(
  document: string,
  screenshotBase64: string | undefined,
  schema: TSchema,
  instructions: string,
): ChatCompletionCreateParamsNonStreaming {
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant that can answer questions about a webpage. Use only the information provided in the html document. Return an empty type response if no relevant information is found. Here is the user's instruction: ${instructions}. Your output must be a valid JSON object that matches the typescript type ${schemaToTypeString(
        schema.properties.data,
      )}.`,
    },
    ...(screenshotBase64
      ? [
          { role: 'user', content: 'Here is the screenshot of the webpage:' },
          {
            role: 'user',
            content: {
              type: 'image_url',
              image_url: { url: screenshotBase64 },
            },
          },
        ]
      : []),
    {
      role: 'user',
      content:
        "Below is the webpage html in a markdown format. Use it to answer the user's question.",
    },
    { role: 'user', content: document },
  ];

  return {
    // @ts-ignore outdated openai version in token.js
    messages,
    stream: false,
    response_format: {
      // @ts-ignore outdated openai version in token.js
      type: 'json_schema',
      json_schema: {
        name: 'page_extract_data_response',
        strict: true,
        schema,
      },
    },
    max_tokens: 4096,
  };
}

function getBodyMarkdown(html: string): string {
  let transformedHtml = '';
  let skipContent = false;

  const parser = new Parser(
    {
      onopentag(tagName, attrs) {
        // Ignore contents of these tags
        if (['script', 'style', 'noscript'].includes(tagName)) {
          skipContent = true;
        } else {
          const attrsString = Object.entries(attrs)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          transformedHtml += `<${tagName}${
            attrsString ? ' ' + attrsString : ''
          }>`;
        }
      },
      ontext(text) {
        if (!skipContent) {
          // Clean up the text: trim and add a space
          transformedHtml += text.trim() + ' ';
        }
      },
      onclosetag(tagName) {
        if (['script', 'style', 'noscript'].includes(tagName)) {
          skipContent = false;
        } else {
          transformedHtml += `</${tagName}>`;
        }
      },
    },
    { decodeEntities: true },
  );

  // Execute parsing
  parser.write(html);
  parser.end();

  return new TurndownService().turndown(transformedHtml);
}
