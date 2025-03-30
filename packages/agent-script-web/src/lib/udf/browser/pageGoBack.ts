import { Static, Type } from '@sinclair/typebox';
import { PageActionUdf } from './pageUdf';
import { IWebAgent, IWebAgentNavigationHistoryItem } from '../../types';

export class PageGoBackUdf extends PageActionUdf {
  name = 'pageGoBack';
  description =
    'Navigates back to the previous location in the browser history';

  inputSchema = Type.Any();

  outputSchema = Type.Any();

  private historyItem: IWebAgentNavigationHistoryItem | undefined;

  override async pageActionCall(
    input: Static<typeof this.inputSchema>,
    agent: IWebAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    await agent.page.goBack();
    return {
      success: true,
    };
  }

  override async onBeforeCall(
    input: Static<typeof this.inputSchema>,
    agent: IWebAgent,
  ) {
    await super.onBeforeCall(input, agent);
    this.historyItem = undefined;
  }

  override async onAfterCall(
    input: Static<typeof this.inputSchema>,
    output: Static<typeof this.outputSchema>,
    agent: IWebAgent,
  ) {
    await super.onAfterCall(input, output, agent);
    if (this.historyItem) {
      this.historyItem.status = 'success';
    }
  }
}
