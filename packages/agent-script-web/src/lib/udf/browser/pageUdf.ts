import { ActionStep, BaseUdf } from '@runparse/agent-script';
import { Static } from '@sinclair/typebox';
import { getBase64Screenshot } from './utils';
import { IWebAgent } from '../../types';
import { PageActionTimeoutError } from './errors';

export abstract class PageUdf extends BaseUdf {
  abstract override call(
    input: Static<this['inputSchema']>,
    agent: IWebAgent,
  ): Promise<Static<this['outputSchema']>>;
}

export const PageActionDefaultTimeoutMs: number = 10000;

export abstract class PageActionUdf extends PageUdf {
  constructor(public timeoutMs: number = PageActionDefaultTimeoutMs) {
    super();
  }

  override async call(
    input: Static<this['inputSchema']>,
    agent: IWebAgent,
  ): Promise<Static<this['outputSchema']>> {
    try {
      const result = await Promise.race([
        this.pageActionCall(input, agent),
        new Promise(async (_, reject) => {
          setTimeout(async () => {
            reject(new PageActionTimeoutError(this.timeoutMs));
          }, this.timeoutMs);
        }),
      ]);
      await this.saveScreenshotToMemory(agent);
      return result;
    } catch (error) {
      if (error instanceof PageActionTimeoutError) {
        await this.saveScreenshotToMemory(
          agent,
          `Page action timed out after ${this.timeoutMs} ms. It is possible that the action succeeded but timed out on page load`,
        );
      }
      throw error;
    }
  }

  protected abstract pageActionCall(
    input: Static<this['inputSchema']>,
    agent: IWebAgent,
  ): Promise<Static<this['outputSchema']>>;

  protected async saveScreenshotToMemory(
    agent: IWebAgent,
    additionalContext: string = '',
  ): Promise<void> {
    // Get current memory step
    const currentStep = agent.memory.steps[agent.memory.steps.length - 1];
    if (!(currentStep instanceof ActionStep)) return;

    // Take screenshot
    const { data: screenshotData } = await getBase64Screenshot(agent.page);

    // Save screenshot to current step
    currentStep.observations.push({
      type: 'image',
      image: screenshotData,
      context: `screenshot after page action ${
        this.name
      } on ${agent.page.url()}${
        additionalContext ? `\n${additionalContext}` : ''
      }`,
    });
  }
}
