import { ActionStep, BaseTool } from '@runparse/code-agents';
import { Static, TSchema } from '@sinclair/typebox';
import { getBase64Screenshot } from '../../utils';
import { IPageQueryAgent } from '../pageQueryAgent';

export abstract class PageTool<
  TInput extends TSchema = any,
  TOutput extends TSchema = any,
> extends BaseTool<TInput, TOutput> {
  abstract override call(
    input: Static<TInput>,
    agent: IPageQueryAgent,
  ): Promise<Static<TOutput>>;
}

export abstract class PageActionTool<
  TInput extends TSchema,
  TOutput extends TSchema,
> extends PageTool<TInput, TOutput> {
  override async onAfterCall(
    input: Static<TInput>,
    output: Static<TOutput>,
    agent: IPageQueryAgent,
  ): Promise<void> {
    await this.saveScreenshotToMemory(agent);
  }

  private async saveScreenshotToMemory(agent: IPageQueryAgent): Promise<void> {
    // Wait for any JavaScript animations to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get current memory step
    const currentStep = agent.memory.steps[agent.memory.steps.length - 1];
    if (!(currentStep instanceof ActionStep)) return;

    // Remove old screenshots to keep memory lean
    for (const step of agent.memory.steps) {
      if (!(step instanceof ActionStep)) continue;
      if (step.stepNumber <= currentStep.stepNumber - 2) {
        step.observationsImages = undefined;
      }
    }

    // Take screenshot
    const { data: screenshotData, metadata } = await getBase64Screenshot(
      agent.page,
    );

    console.log(
      `Captured browser screenshot: ${metadata.width}x${
        metadata.height
      } pixels. Source: ${agent.page.url()}. Step: ${currentStep.stepNumber}`,
    );

    // Save screenshot to current step
    currentStep.observationsImages = [screenshotData];

    // Update step observations with current URL
    const urlInfo = `Current url: ${agent.page.url()}`;
    currentStep.observations = currentStep.observations
      ? `${currentStep.observations}\n${urlInfo}`
      : urlInfo;
  }
}
