import { TObject, TString, Type, TSchema, Static } from '@sinclair/typebox';
import { PageTool } from './pageTool';
import { IChatModel } from '@runparse/code-agents';
import { TObjectWrapper } from '@runparse/code-agents';
import TurndownService from 'turndown';
import { CompletionNonStreaming, LLMProvider } from 'token.js/dist/chat';
import { IPageQueryAgent } from '../pageQueryAgent';
import { ChatModel } from '@runparse/code-agents';
import { Parser } from 'htmlparser2';
import { getBase64Screenshot } from '../../utils';

export class PageExtractDataTool extends PageTool<
  TObject<{ instructions: TString }>,
  TSchema
> {
  name = 'pageExtractData';
  description =
    'Extracts data from current webpage you are on, following user instructions as a serialized JSON object / array.';

  inputSchema = Type.Object(
    {
      instructions: Type.String(),
    },
    { default: { instructions: 'string' } },
  );
  outputSchema = Type.Any();

  private dataObjectSchema: TObjectWrapper;

  private model: IChatModel;

  private visualMode: boolean = false;

  constructor({
    model,
    dataObjectSchema,
    visualMode = false,
  }: {
    model?: IChatModel;
    dataObjectSchema: TObjectWrapper;
    visualMode?: boolean;
  }) {
    super();
    this.model =
      model ||
      new ChatModel({
        provider: 'openai',
        model: 'gpt-4o-mini',
      });

    this.dataObjectSchema = dataObjectSchema;
    this.visualMode = visualMode;
    this.outputSchema.default = this.dataObjectSchema.jsonSchemaInstance;
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IPageQueryAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const content = await agent.page.content();

    const bodyMarkdown = getBodyMarkdown(content);

    const response = await this.model.chatCompletion(
      getDataExtractionPrompt(
        bodyMarkdown,
        this.visualMode
          ? (
              await getBase64Screenshot(agent.page)
            ).data
          : undefined,
        this.dataObjectSchema.tSchema,
        input.instructions,
      ),
    );

    return this.dataObjectSchema.getData(JSON.parse(response.message.content));
  }

  override async onAfterCall(
    input: Static<typeof this.inputSchema>,
    output: Static<typeof this.outputSchema>,
    agent: IPageQueryAgent,
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
): CompletionNonStreaming<LLMProvider> {
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant that can answer questions about a webpage. Use only the information provided in the html document. Return an empty type response if no relevant information is found. Here is the user's instruction: ${instructions}`,
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
  let extractedText = '';
  let skipContent = false;

  const parser = new Parser(
    {
      onopentag(tagName) {
        // Ignore contents of these tags
        if (['script', 'style', 'noscript'].includes(tagName)) {
          skipContent = true;
        }
      },
      ontext(text) {
        if (!skipContent) {
          // Clean up the text: trim and add a space
          extractedText += text.trim() + ' ';
        }
      },
      onclosetag(tagName) {
        if (['script', 'style', 'noscript'].includes(tagName)) {
          skipContent = false;
        }
      },
    },
    { decodeEntities: true },
  );

  // Execute parsing
  parser.write(html);
  parser.end();

  return new TurndownService().turndown(extractedText);
}
