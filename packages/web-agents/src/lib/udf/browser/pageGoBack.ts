import { Static, Type } from '@sinclair/typebox';
import { PageActionUdf } from './pageUdf';
import {
  IParticleAgent,
  IParticleAgentNavigationHistoryItem,
} from '../../types';

export class PageGoBackUdf extends PageActionUdf {
  name = 'pageGoBack';
  description =
    'Navigates back to the previous location in the browser history';

  inputSchema = Type.Any();

  outputSchema = Type.Any();

  private historyItem: IParticleAgentNavigationHistoryItem | undefined;

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IParticleAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    await agent.page.goBack();
    return {
      success: true,
    };
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
