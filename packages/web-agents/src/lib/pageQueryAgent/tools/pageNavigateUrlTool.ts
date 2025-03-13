import {
  Static,
  TString,
  Type,
  TObject,
  TBoolean,
  TOptional,
} from '@sinclair/typebox';
import { PageActionTool } from './pageTool';
import {
  IPageQueryAgent,
  IPageQueryAgentNavigationHistoryItem,
} from '../pageQueryAgent';

export class PageNavigateUrlTool extends PageActionTool<
  TObject<{ url: TString }>,
  TObject<{ success: TBoolean; message: TOptional<TString> }>
> {
  name = 'pageNavigateUrl';
  description = 'Navigates to a specific URL';

  inputSchema = Type.Object(
    {
      url: Type.String(),
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
    agent: IPageQueryAgent,
  ) {
    await super.onBeforeCall(input, agent);
    this.historyItem = undefined;
  }

  override async onAfterCall(
    input: Static<typeof this.inputSchema>,
    output: Static<typeof this.outputSchema>,
    agent: IPageQueryAgent,
  ) {
    await super.onAfterCall(input, output, agent);
    if (this.historyItem) {
      this.historyItem.status = 'success';
    }
  }
}
