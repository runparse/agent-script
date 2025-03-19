import { Static, Type } from '@sinclair/typebox';
import { PageActionUdf } from './pageUdf';
import {
  IParticleAgent,
  IParticleAgentNavigationHistoryItem,
} from '../../types';

export class PageNavigateUrlUdf extends PageActionUdf {
  name = 'pageNavigateUrl';
  description = 'Navigates to a specific URL';

  inputSchema = Type.Object(
    {
      url: Type.String({
        description: 'The URL to navigate to',
      }),
    },
    { default: { url: 'string' } },
  );

  outputSchema = Type.Object(
    {
      success: Type.Boolean(),
      message: Type.Optional(Type.String()),
    },
    { default: { success: true, message: 'string' } },
  );

  private historyItem: IParticleAgentNavigationHistoryItem | undefined;

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IParticleAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    if (
      agent.navigationHistory.find(
        (historyItem) => historyItem.url === input.url,
      )
    ) {
      this.historyItem = {
        url: input.url,
        timestamp: Date.now(),
        status: 'skipped',
      };
      return { success: false, message: 'already visited, skipping' };
    }
    this.historyItem = {
      url: input.url,
      timestamp: Date.now(),
      status: 'loading',
    };
    agent.navigationHistory.push(this.historyItem);
    await agent.page.goto(input.url, { timeout: 10000 });
    return { success: true };
  }

  override async onBeforeCall(
    input: Static<typeof this.inputSchema>,
    agent: IParticleAgent,
  ) {
    await super.onBeforeCall(input, agent);
    this.historyItem = undefined;
  }

  override async onAfterCall(
    input: Static<typeof this.inputSchema>,
    output: Static<typeof this.outputSchema>,
    agent: IParticleAgent,
  ) {
    await super.onAfterCall(input, output, agent);
    if (this.historyItem) {
      this.historyItem.status = 'success';
    }
  }
}
