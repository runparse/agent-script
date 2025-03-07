import { Static, TString, Type, TObject, TBoolean } from '@sinclair/typebox';
import { PageActionTool } from './pageTool';
import {
  IPageQueryAgent,
  IPageQueryAgentNavigationHistoryItem,
} from '../pageQueryAgent';

export class PageNavigateUrlTool extends PageActionTool<
  TObject<{ url: TString }>,
  TBoolean
> {
  name = 'pageNavigateUrl';
  description = 'Navigates to a specific URL';

  inputSchema = Type.Object(
    {
      url: Type.String(),
    },
    { default: { url: 'string' } },
  );

  outputSchema = Type.Boolean();

  private historyItem: IPageQueryAgentNavigationHistoryItem | undefined;

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IPageQueryAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    if (
      agent.navigationHistory.find(
        (historyItem) => historyItem.url === input.url,
      )
    ) {
      return false;
    }
    this.historyItem = {
      url: input.url,
      timestamp: Date.now(),
      status: 'pending',
    };
    agent.navigationHistory.push(this.historyItem);
    await agent.page.goto(input.url, { timeout: 10000 });
    return true;
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
