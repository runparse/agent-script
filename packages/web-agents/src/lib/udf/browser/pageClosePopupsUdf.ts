import { Type, Static } from '@sinclair/typebox';
import { PageActionUdf } from './pageUdf';
import { IParticleAgent } from '../../types';

export class PageClosePopupsUdf extends PageActionUdf {
  name = 'pageClosePopups';
  description = 'Closes any visible popups or modals on the webpage';

  inputSchema = Type.Object(
    {
      popupCloseButtonLabel: Type.String(),
    },
    { default: { popupCloseButtonLabel: 'string' } },
  );

  outputSchema = Type.Boolean();

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IParticleAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const sameDomainLinks = await agent.page
      .getByRole('link', { name: input.popupCloseButtonLabel })
      .all();
    const buttons = await agent.page
      .getByRole('button', { name: input.popupCloseButtonLabel })
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
