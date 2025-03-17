import { Page } from 'playwright';
import { PageExtractDataUdf } from '../../udf/browser/pageExtractDataUdf';
import { PageLoadMoreDataUdf } from '../../udf/browser/pageLoadMoreDataUdf';
import { PageNavigateLinkUdf } from '../../udf/browser/pageNavigateLinkUdf';
import { PageNavigateUrlUdf } from '../../udf/browser/pageNavigateUrlUdf';
import {
  IChatMessage,
  ActionStep,
  DatasheetWriteUdf,
  PartialBy,
  ICodeAgentProps,
  CodeAgent,
  BingSearchUdf,
  TerminateUdf,
  IUdf,
} from '@runparse/agents';
import { Static } from '@sinclair/typebox';
import { PageUdf } from '../../udf/browser/pageUdf';
import { IParticleAgentNavigationHistoryItem } from '../../types';
import { TObjectWrapper } from '../../jsonSchema';
import { particleAgentPrompt } from './particleAgent.prompt';
export interface IParticleAgentProps
  extends Omit<PartialBy<ICodeAgentProps, 'description' | 'prompts'>, 'udfs'> {
  page: Page;
  instructions: string;
  navigationHistory?: IParticleAgentNavigationHistoryItem[];
  dataObjectSchema: TObjectWrapper;
  udfs: {
    pageExtractDataUdf: PageExtractDataUdf;
    datasheetWriteUdf: DatasheetWriteUdf;
    otherUdfs?: PageUdf[];
  };
}

export class ParticleAgent extends CodeAgent {
  page: Page;
  instructions: string;
  navigationHistory: IParticleAgentNavigationHistoryItem[];
  override udfs: IUdf[];

  constructor(props: IParticleAgentProps) {
    const defaultUdfs: IUdf[] = [
      new PageNavigateLinkUdf(),
      new PageNavigateUrlUdf(),
      new PageLoadMoreDataUdf(),
      new BingSearchUdf(),
      new TerminateUdf(),
    ];

    const udfs = defaultUdfs.filter(
      (defaultUdf) =>
        !props.udfs.otherUdfs?.some(
          (overrideUdf) => overrideUdf.name === defaultUdf.name,
        ),
    );
    udfs.push(...(props.udfs.otherUdfs || []));
    udfs.push(props.udfs.pageExtractDataUdf);
    udfs.push(props.udfs.datasheetWriteUdf);

    super({
      ...props,
      prompts: props.prompts || particleAgentPrompt,
      udfs,
      description:
        props.description ||
        `You object is to collect data as JSON objects with the following structure:\n\n${JSON.stringify(
          props.dataObjectSchema.jsonSchemaInstance,
        )} using the 'notebookWrite' function whenever you find relevant data after extracting data from a webpage or searching the web. Visit every link from the results after doing a web search. You can close popups, load more data, and extract data following user instructions on a webpage. Navigate away from the page if you see a captcha. Always use the 'pageExtractData' tool before using the 'pageLoadMoreData' tool. You must call the 'notebookWrite' at least once before the using the 'finalAnswer' tool to save any relevant data.`,
    });

    this.page = props.page;
    this.instructions = props.instructions;

    this.udfs = udfs;

    this.navigationHistory = props.navigationHistory || [];
  }

  getDatasheetEntries() {
    return Array.from(
      this.udfs.find((udf) => udf instanceof DatasheetWriteUdf)!.entries,
    );
  }

  override writeMemoryToMessages(summaryMode: boolean): IChatMessage[] {
    const messages = super.writeMemoryToMessages(summaryMode);
    if (this.navigationHistory.length > 0) {
      const currentLocationString = `You are currently at this url: ${this.page.url()}\n\n`;
      messages.push({
        role: 'user',
        content: `${currentLocationString}Do not navigate to any of the following urls you have visited:\n${this.navigationHistory
          .map((item) => `- ${item.url}`)
          .join('\n')}`,
      });
    }
    return messages;
  }

  override async step(
    memoryStep: ActionStep,
  ): Promise<Static<this['outputSchema']> | undefined> {
    // Get current memory step
    const currentStep = this.memory.steps[this.memory.steps.length - 1];
    if (!(currentStep instanceof ActionStep)) return;

    // Remove old screenshots to keep memory lean
    for (const step of this.memory.steps) {
      if (!(step instanceof ActionStep)) continue;
      if (step.stepNumber <= currentStep.stepNumber - 2) {
        step.observationsImages = undefined;
      }
    }

    return super.step(memoryStep);
  }
}
