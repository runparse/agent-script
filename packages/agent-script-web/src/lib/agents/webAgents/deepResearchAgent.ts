import {
  ActionStep,
  BingSearchUdf,
  CodeAgent,
  DuckduckgoSearchUdf,
  FinalAnswerUdf,
  IChatMessage,
  ICodeAgentProps,
  IUdf,
  PartialBy,
  ThinkUdf,
} from '@runparse/agent-script';
import { Static } from '@sinclair/typebox';
import { Page } from 'playwright';
import { IWebAgent, IWebAgentNavigationHistoryItem } from '../../types';
import {
  PageClickUdf,
  PageGoBackUdf,
  PageNavigateUrlUdf,
} from '../../udf/browser/index';
import { deepResearchAgentPrompt } from './deepResearchAgent.prompt';
import { PageReadUdf } from '../../udf/browser/pageReadUdf';

export const getDeepResearchAgentDefaultUdfs = ({
  useBingSearch = true,
}: {
  useBingSearch?: boolean;
}) => [
  useBingSearch ? new BingSearchUdf() : new DuckduckgoSearchUdf(),
  new PageClickUdf(),
  new PageNavigateUrlUdf(),
  new PageGoBackUdf(),
  new PageReadUdf({}),
  new FinalAnswerUdf(),
  new ThinkUdf(),
];

export interface IDeepResearchAgentProps
  extends Omit<PartialBy<ICodeAgentProps, 'description' | 'prompts'>, 'udfs'> {
  page: Page;
  navigationHistory?: IWebAgentNavigationHistoryItem[];
  udfs?: IUdf[];
}

export class DeepResearchAgent extends CodeAgent implements IWebAgent {
  page: Page;
  navigationHistory: IWebAgentNavigationHistoryItem[];

  override udfs: IUdf[];

  constructor(props: IDeepResearchAgentProps) {
    const udfs: IUdf[] = props.udfs || getDeepResearchAgentDefaultUdfs({});

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
      prompts: props.prompts || deepResearchAgentPrompt,
      udfs,
      description:
        props.description ||
        `You object is to generate a report for a research task. Use the provided UDFs to explore the internet and read information from web pages. Navigate away from the page if you see a captcha.`,
    });

    this.page = props.page;

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
}
