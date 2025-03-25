import {
  ActionStep,
  BingSearchUdf,
  CodeAgent,
  DatasheetWriteUdf,
  IChatMessage,
  ICodeAgentProps,
  IUdf,
  PartialBy,
  TerminateUdf,
  ThinkUdf,
} from '@runparse/agent-script';
import { Static, TSchema, Type } from '@sinclair/typebox';
import { Page } from 'playwright';
import { IWebAgentNavigationHistoryItem } from '../../types';
import {
  PageClickUdf,
  PageExtractDataUdf,
  PageGoBackUdf,
  PageNavigateUrlUdf,
} from '../../udf/browser/index';
import { generateDefaultJsonSchemaInstance } from '../../utils/schema';
import { webAgentPrompt } from './webAgent.prompt';

export const WebAgentDefaultUdfs = [
  new PageClickUdf(),
  new PageNavigateUrlUdf(),
  new PageGoBackUdf(),
  new DatasheetWriteUdf({}),
  new BingSearchUdf(),
  new TerminateUdf(),
  new ThinkUdf(),
];

export interface IWebAgentProps
  extends Omit<PartialBy<ICodeAgentProps, 'description' | 'prompts'>, 'udfs'> {
  page: Page;
  instructions: string;
  navigationHistory?: IWebAgentNavigationHistoryItem[];
  dataObjectSchema: TSchema;
  udfs?: IUdf[];
}

export class WebAgent extends CodeAgent {
  page: Page;
  instructions: string;
  navigationHistory: IWebAgentNavigationHistoryItem[];

  override udfs: IUdf[];

  constructor(props: IWebAgentProps) {
    let udfs: IUdf[] = props.udfs || WebAgentDefaultUdfs;
    udfs.push(
      new PageExtractDataUdf({
        model: props.model,
        objectSchema: props.dataObjectSchema,
      }),
    );

    if (!udfs.some((udf) => udf instanceof DatasheetWriteUdf)) {
      throw new Error('datasheetWrite UDF is required');
    }

    super({
      ...props,
      prompts: props.prompts || webAgentPrompt,
      udfs,
      description:
        props.description ||
        `You object is to collect data as JSON objects with the following structure:\n\n${JSON.stringify(
          generateDefaultJsonSchemaInstance(props.dataObjectSchema),
        )} using the 'datasheetWrite' UDF to save any relevant data after extracting data from a webpage or searching the web. Visit every link from the results after doing a web search. Use the provided page UDFs to explore the webpage and extract data following user instructions. Navigate away from the page if you see a captcha.`,
    });

    this.page = props.page;
    this.instructions = props.instructions;

    this.udfs = udfs;

    this.navigationHistory = props.navigationHistory || [];
    this.outputSchema = Type.Array(props.dataObjectSchema);
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
        step.observations = step.observations?.filter(
          (o) => !(o.type === 'image' && o.context?.includes('screenshot')),
        );
      }
    }

    return super.step(memoryStep);
  }

  getDatasheetEntries() {
    return this.udfs
      .find((udf) => udf instanceof DatasheetWriteUdf)!
      .getEntries();
  }

  override async call(
    task: string,
    kwargs: any,
  ): Promise<Static<this['outputSchema']>> {
    await super.call(task, kwargs);
    return this.getDatasheetEntries();
  }
}
