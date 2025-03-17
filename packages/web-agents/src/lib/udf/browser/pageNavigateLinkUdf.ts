import { Static, Type } from '@sinclair/typebox';
import { PageActionUdf } from './pageUdf';
import {
  IParticleAgent,
  IParticleAgentNavigationHistoryItem,
} from '../../types';

export class PageNavigateLinkUdf extends PageActionUdf {
  name = 'pageNavigateLink';
  description = 'Navigates to a link on the page';

  inputSchema = Type.Object(
    {
      linkText: Type.String(),
    },
    { default: { linkText: 'string' } },
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
    const links = await agent.page
      .getByRole('link')
      .getByText(input.linkText)
      .all();

    if (links.length === 0) {
      return { success: false, message: 'no links found' };
    }

    for (const link of links) {
      const href = await link.getAttribute('href');
      const url = href?.startsWith('http') ? href : `${agent.page.url}${href}`;
      if (url) {
        if (!agent.navigationHistory.find((item) => item.url === url)) {
          this.historyItem = {
            url,
            timestamp: Date.now(),
            status: 'loading',
          };
          agent.navigationHistory.push(this.historyItem);
          await link.click();
          return { success: true };
        }
      } else {
        this.historyItem = {
          url,
          timestamp: Date.now(),
          status: 'skipped',
        };
      }
    }
    return { success: false, message: 'failed to navigate' };
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
