import { Type, TSchema, Static } from '@sinclair/typebox';
import { PageUdf } from './pageUdf';
import { IChatModel, ChatModel } from '@runparse/agent-script';
import TurndownService from 'turndown';
import { IWebAgent } from '../../types';
import { Parser } from 'htmlparser2';
import { getBase64Screenshot } from './utils';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

export class PageReadUdf extends PageUdf {
  name = 'pageRead';
  description =
    'Read information from the current webpage you are on, following user instructions';

  inputSchema = Type.Object(
    {
      instructions: Type.String({
        description:
          'Describe the type of information you want to read from the webpage',
      }),
    },
    { default: { instructions: 'string' } },
  );

  outputSchema: TSchema = Type.String();
  private model: IChatModel;
  private visualMode: boolean = false;

  constructor({
    model,
    visualMode = false,
  }: {
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
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IWebAgent,
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
        input.instructions,
      ),
    );

    return response.message.content;
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
  instructions: string,
): ChatCompletionCreateParamsNonStreaming {
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant that can answer questions about a webpage. Use only the information provided in the html document. Return an empty type response if no relevant information is found. Here is the user's instruction: ${instructions}.`,
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
