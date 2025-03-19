import { ActionStep, BaseUdf } from '@runparse/agents';
import { Static } from '@sinclair/typebox';
import { getBase64Screenshot } from './utils';
import { IParticleAgent } from '../../types';

export abstract class PageUdf extends BaseUdf {
  abstract override call(
    input: Static<this['inputSchema']>,
    agent: IParticleAgent,
  ): Promise<Static<this['outputSchema']>>;
}

export abstract class PageActionUdf extends PageUdf {
  override async onAfterCall(
    input: Static<this['inputSchema']>,
    output: Static<this['outputSchema']>,
    agent: IParticleAgent,
  ): Promise<void> {
    await this.saveScreenshotToMemory(agent);
  }

  private async saveScreenshotToMemory(agent: IParticleAgent): Promise<void> {
    // Wait for any JavaScript animations to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get current memory step
    const currentStep = agent.memory.steps[agent.memory.steps.length - 1];
    if (!(currentStep instanceof ActionStep)) return;

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
