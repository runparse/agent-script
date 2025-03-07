import { Static, TBoolean, TObject, TString, Type } from '@sinclair/typebox';
import { PageActionTool } from './pageTool';
import { IPageQueryAgent } from '../pageQueryAgent';

export class PageLoadMoreDataTool extends PageActionTool<
  TObject<{ loadMoreButtonLabel: TString }>,
  TBoolean
> {
  name = 'pageLoadMoreData';
  description = 'Loads more data from the webpage';

  inputSchema = Type.Object(
    {
      loadMoreButtonLabel: Type.String(),
    },
    { default: { loadMoreButtonLabel: 'string' } },
  );

  outputSchema = Type.Boolean();

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IPageQueryAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const sameDomainLinks = await agent.page
      .getByRole('link', { name: input.loadMoreButtonLabel })
      .all();
    const buttons = await agent.page
      .getByRole('button', { name: input.loadMoreButtonLabel })
      .all();

    const locatorList = [
      ...sameDomainLinks.filter(async (locator) => {
        const href = await locator.getAttribute('href');
        return (
          href?.startsWith(agent.page.url()) ||
          href?.startsWith('/') ||
          href?.startsWith('?')
        );
      }),
      ...buttons,
    ];

    if (locatorList.length === 0) {
      console.log(`found locators count: ${locatorList.length}`);
      return false;
    }

    for (const locator of locatorList) {
      if (await locator.isVisible()) {
        await locator.click();
        return true;
      }
    }

    return false;
  }
}
