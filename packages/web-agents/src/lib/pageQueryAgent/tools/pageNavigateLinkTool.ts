import { Static, TBoolean, TObject, TString, Type } from '@sinclair/typebox';
import { PageActionTool } from './pageTool';
import {
  IPageQueryAgent,
  IPageQueryAgentNavigationHistoryItem,
} from '../pageQueryAgent';

export class PageNavigateLinkTool extends PageActionTool<
  TObject<{ linkText: TString }>,
  TBoolean
> {
  name = 'pageNavigateLink';
  description = 'Navigates to a link on the page';

  inputSchema = Type.Object(
    {
      linkText: Type.String(),
    },
    { default: { linkText: 'string' } },
  );

  outputSchema = Type.Boolean();

  private historyItem: IPageQueryAgentNavigationHistoryItem | undefined;

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IPageQueryAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const links = await agent.page
      .getByRole('link')
      .getByText(input.linkText)
      .all();

    if (links.length === 0) {
      return false;
    }

    for (const link of links) {
      const href = await link.getAttribute('href');
      const url = href?.startsWith('http') ? href : `${agent.page.url}${href}`;
      if (url && !agent.navigationHistory.find((item) => item.url === url)) {
        this.historyItem = {
          url,
          timestamp: Date.now(),
          status: 'pending',
        };
        agent.navigationHistory.push(this.historyItem);
        await link.click();
        return true;
      }
    }
    return false;
  }

  override async onBeforeCall(
    input: Static<typeof this.inputSchema>,
    agent: IPageQueryAgent,
  ) {
    super.onBeforeCall(input, agent);
    this.historyItem = undefined;
  }

  override async onAfterCall(
    input: Static<typeof this.inputSchema>,
    output: Static<typeof this.outputSchema>,
    agent: IPageQueryAgent,
  ) {
    super.onAfterCall(input, output, agent);
    if (this.historyItem) {
      this.historyItem.status = 'success';
    }
  }
}
