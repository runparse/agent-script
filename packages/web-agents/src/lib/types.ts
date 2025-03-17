import { ICodeAgent, IUdf } from '@runparse/agents';
import { Page } from 'playwright';
import { Static } from '@sinclair/typebox';

export interface IParticleAgentNavigationHistoryItem {
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
    agent: IParticleAgent,
  ): Promise<Static<this['outputSchema']>>;
}

export interface IParticleAgent extends ICodeAgent {
  page: Page;
  instructions: string;
  navigationHistory: IParticleAgentNavigationHistoryItem[];
  udfs: IPageUdf[];
}
