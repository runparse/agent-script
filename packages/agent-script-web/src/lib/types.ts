import { ICodeAgent, IUdf } from '@runparse/agent-script';
import { Page } from 'playwright';
import { Static } from '@sinclair/typebox';

export interface IWebAgentNavigationHistoryItem {
  url: string;
  timestamp: number;
  status: 'loading' | 'success' | 'error' | 'skipped';
  dataExtraction?: {
    data: any;
    error?: string;
  };
}

export interface IPageUdf extends IUdf {
  call(
    input: Static<this['inputSchema']>,
    agent: IWebAgent,
  ): Promise<Static<this['outputSchema']>>;
}

export interface IWebAgent extends ICodeAgent {
  page: Page;
  navigationHistory: IWebAgentNavigationHistoryItem[];
}
