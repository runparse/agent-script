import { Page } from 'playwright';
import { PageExtractDataTool } from './tools/pageExtractDataTool';
import { PageLoadMoreDataTool } from './tools/pageLoadMoreDataTool';
import { PageNavigateLinkTool } from './tools/pageNavigateLinkTool';
import { PageNavigateUrlTool } from './tools/pageNavigateUrlTool';
import {
  CodeAgent,
  IChatMessage,
  ICodeAgent,
  ICodeAgentProps,
} from '@runparse/code-agents';
import { TSchema, TString } from '@sinclair/typebox';
import { PartialBy } from '@runparse/code-agents';
import { PageTool } from './tools/pageTool';
import { NotebookWriteTool } from '@runparse/code-agents';
import { TObjectWrapper } from '@runparse/code-agents';

export interface IPageQueryAgentNavigationHistoryItem {
  url: string;
  timestamp: number;
  status: 'pending' | 'success' | 'error';
  dataExtraction?: {
    data: any;
    error?: string;
  };
}

export interface IPageQueryAgent<TOutSchema extends TSchema = TString>
  extends ICodeAgent<TOutSchema> {
  page: Page;
  instructions: string;
  navigationHistory: IPageQueryAgentNavigationHistoryItem[];
  tools: PageTool[];
}

export interface IPageQueryAgentProps<TOutSchema extends TSchema>
  extends Omit<PartialBy<ICodeAgentProps<TOutSchema>, 'description'>, 'tools'> {
  page: Page;
  instructions: string;
  navigationHistory?: IPageQueryAgentNavigationHistoryItem[];
  dataObjectSchema: TObjectWrapper;
  tools: {
    pageExtractDataTool: PageExtractDataTool;
    notebookWriteTool: NotebookWriteTool;
    otherTools?: PageTool[];
  };
}

export class PageQueryAgent
  extends CodeAgent<TString>
  implements IPageQueryAgent<TString>
{
  page: Page;
  instructions: string;
  navigationHistory: IPageQueryAgentNavigationHistoryItem[];
  override tools: PageTool[];

  constructor(props: IPageQueryAgentProps<TString>) {
    const defaultTools: PageTool[] = [
      new PageNavigateLinkTool(),
      new PageNavigateUrlTool(),
      new PageLoadMoreDataTool(),
    ];

    const tools = defaultTools.filter(
      (defaultTool) =>
        !props.tools.otherTools?.some(
          (overrideTool) => overrideTool.name === defaultTool.name,
        ),
    );
    tools.push(...(props.tools.otherTools || []));
    tools.push(props.tools.pageExtractDataTool);
    tools.push(props.tools.notebookWriteTool);

    super({
      ...props,
      tools: tools,
      description:
        props.description ||
        `Your main object is to collect data as JSON objects with the following structure:\n\n${JSON.stringify(
          props.dataObjectSchema.jsonSchemaInstance,
        )} using the 'notebookWrite' tool whenever you extract data. You must call the 'notebookWrite' at least once before the using the 'finalAnswer' tool if any data is found. You can close popups, load more data, and extract data following user instructions on a webpage. Always use the 'pageExtractData' tool before using the 'pageLoadMoreData' tool. Use the 'pageLoadMoreData' tool for a maximum of 3 times. If there are no relevant data on the page, write an explanation and any relevant information you can find.`,
    });

    this.page = props.page;
    this.instructions = props.instructions;

    this.tools = tools;

    this.navigationHistory = props.navigationHistory || [];
  }

  getNotebookEntries() {
    return Array.from(
      this.tools.find((tool) => tool instanceof NotebookWriteTool)!.entries,
    );
  }

  override writeMemoryToMessages(summaryMode: boolean): IChatMessage[] {
    const messages = super.writeMemoryToMessages(summaryMode);
    messages.push({
      role: 'user',
      content: `FYI, here is a list of urls you already visited:\n${this.navigationHistory
        .map((item) => `- ${item.url}`)
        .join('\n')}`,
    });
    return messages;
  }
}
