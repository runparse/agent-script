import { Page } from 'playwright';
import { PageExtractDataUdf } from '../../udf/browser/pageExtractDataUdf';
import { PageClickUdf } from '../../udf/browser/pageClickUdf';
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
  ThinkUdf,
  IUdf,
} from '@runparse/agents';
import { Static, TSchema } from '@sinclair/typebox';
import { IParticleAgentNavigationHistoryItem } from '../../types';
import { particleAgentPrompt } from './particleAgent.prompt';
import { PageGoBackUdf } from '../../udf/browser/pageGoBack';
import { generateDefaultJsonSchemaInstance } from '@runparse/web-agents';

export interface IParticleAgentProps
  extends Omit<PartialBy<ICodeAgentProps, 'description' | 'prompts'>, 'udfs'> {
  page: Page;
  instructions: string;
  navigationHistory?: IParticleAgentNavigationHistoryItem[];
  dataObjectSchema: TSchema;
  udfs?: IUdf[];
}

export class ParticleAgent extends CodeAgent {
  page: Page;
  instructions: string;
  navigationHistory: IParticleAgentNavigationHistoryItem[];
  override udfs: IUdf[];

  constructor(props: IParticleAgentProps) {
    let udfs: IUdf[] = [
      new PageClickUdf(),
      new PageNavigateUrlUdf(),
      new PageGoBackUdf(),
      new PageExtractDataUdf({
        objectSchema: props.dataObjectSchema,
      }),
      new DatasheetWriteUdf({}),
      new BingSearchUdf(),
      new TerminateUdf(),
      new ThinkUdf(),
    ];

    if (props.udfs) {
      udfs = udfs
        .filter(
          (defaultUdf) =>
            !props.udfs!.some(
              (overrideUdf) => overrideUdf.name === defaultUdf.name,
            ),
        )
        .concat(props.udfs);
    }

    super({
      ...props,
      prompts: props.prompts || particleAgentPrompt,
      udfs,
      description:
        props.description ||
        `You object is to collect data as JSON objects with the following structure:\n\n${JSON.stringify(
          generateDefaultJsonSchemaInstance(props.dataObjectSchema),
        )} using the 'notebookWrite' function whenever you find relevant data after extracting data from a webpage or searching the web. Visit every link from the results after doing a web search. You can close popups, load more data, and extract data following user instructions on a webpage. Navigate away from the page if you see a captcha. Always use the 'pageExtractData' tool before using the 'pageLoadMoreData' tool. You must call the 'notebookWrite' at least once before the using the 'finalAnswer' tool to save any relevant data.`,
    });

    this.page = props.page;
    this.instructions = props.instructions;

    this.udfs = udfs;

    this.navigationHistory = props.navigationHistory || [];
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

  getDatasheetEntries() {
    return this.udfs
      .find((udf) => udf instanceof DatasheetWriteUdf)!
      .getEntries();
  }
}
