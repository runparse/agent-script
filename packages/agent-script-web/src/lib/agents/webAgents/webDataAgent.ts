import {
  ActionStep,
  BingSearchUdf,
  CodeAgent,
  DatasheetWriteUdf,
  DuckduckgoSearchUdf,
  IChatMessage,
  IChatModel,
  ICodeAgentProps,
  IUdf,
  PartialBy,
  TerminateUdf,
  ThinkUdf,
} from '@runparse/agent-script';
import { Static, TSchema, Type } from '@sinclair/typebox';
import { Page } from 'playwright';
import { IWebAgent, IWebAgentNavigationHistoryItem } from '../../types';
import {
  PageClickUdf,
  PageExtractDataUdf,
  PageGoBackUdf,
  PageNavigateUrlUdf,
} from '../../udf/browser/index';
import { generateDefaultJsonSchemaInstance } from '../../utils/schema';
import { webDataAgentPrompt } from './webDataAgent.prompt';

export const getWebDataAgentDefaultUdfs = ({
  useBingSearch = true,
  extractionModel,
  extractionObjectSchema,
}: {
  useBingSearch?: boolean;
  extractionModel?: IChatModel;
  extractionObjectSchema: TSchema;
}) => [
  new PageClickUdf(),
  new PageNavigateUrlUdf(),
  new PageGoBackUdf(),
  new DatasheetWriteUdf({}),
  useBingSearch ? new BingSearchUdf() : new DuckduckgoSearchUdf(),
  new TerminateUdf(),
  new ThinkUdf(),
  new PageExtractDataUdf({
    model: extractionModel,
    objectSchema: extractionObjectSchema,
  }),
];

export interface IWebDataAgentProps
  extends Omit<PartialBy<ICodeAgentProps, 'description' | 'prompts'>, 'udfs'> {
  page: Page;
  navigationHistory?: IWebAgentNavigationHistoryItem[];
  dataObjectSchema: TSchema;
  udfs?: IUdf[];
}

export class WebDataAgent extends CodeAgent implements IWebAgent {
  page: Page;
  navigationHistory: IWebAgentNavigationHistoryItem[];

  override udfs: IUdf[];

  constructor(props: IWebDataAgentProps) {
    const udfs: IUdf[] =
      props.udfs ||
      getWebDataAgentDefaultUdfs({
        extractionModel: props.model,
        extractionObjectSchema: props.dataObjectSchema,
      });

    if (!udfs.some((udf) => udf instanceof DatasheetWriteUdf)) {
      throw new Error('The DatasheetWrite UDF is required');
    }
    if (!udfs.some((udf) => udf instanceof PageExtractDataUdf)) {
      throw new Error('The PageExtractData UDF is required');
    }
    if (
      !udfs.some(
        (udf) =>
          udf instanceof BingSearchUdf || udf instanceof DuckduckgoSearchUdf,
      )
    ) {
      throw new Error('A web search UDF is required');
    }

    super({
      ...props,
      prompts: props.prompts || webDataAgentPrompt,
      udfs,
      description:
        props.description ||
        `You object is to collect data as JSON objects with the following structure:\n\n${JSON.stringify(
          generateDefaultJsonSchemaInstance(props.dataObjectSchema),
        )} using the 'datasheetWrite' UDF to save any relevant data after extracting data from a webpage or searching the web. Use the provided page UDFs to explore the webpage and extract data following user instructions. Navigate away from the page if you see a captcha.`,
    });

    this.page = props.page;

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
    if (currentStep instanceof ActionStep) {
      // Remove old screenshots to keep memory lean
      for (const step of this.memory.steps) {
        if (!(step instanceof ActionStep)) continue;
        if (step.stepNumber <= currentStep.stepNumber - 2) {
          step.observations = step.observations?.filter(
            (o) => !(o.type === 'image' && o.context?.includes('screenshot')),
          );
        }
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
