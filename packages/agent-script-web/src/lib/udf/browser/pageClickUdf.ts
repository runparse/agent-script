import { Static, Type } from '@sinclair/typebox';
import { PageActionUdf } from './pageUdf';
import { IWebAgent, IWebAgentNavigationHistoryItem } from '../../types';
import { ElementRole } from './utils';
import { getBestElementByText } from './utils';
import { notEmpty } from '@runparse/agent-script';

export class PageClickUdf extends PageActionUdf {
  name = 'pageClick';
  description = 'Clicks on an element on the page';

  inputSchema = Type.Object(
    {
      elementText: Type.String({
        description: 'The text of the element to click',
      }),
      // elementRole: Type.Optional(
      //   Type.Enum(ElementRole, {
      //     description: '(Optional) The role of the element to click',
      //   }),
      // ),
      elementIndex: Type.Optional(
        Type.Number({
          description:
            '(Optional) The index of the element in the matching elements. 0 is the first element, 1 is the second element, etc. Defaults to 0',
        }),
      ),
    },
    { default: { elementText: 'string', elementRole: ElementRole.LINK } },
  );

  outputSchema = Type.Object(
    {
      success: Type.Boolean(),
      candidateElementLabels: Type.Optional(Type.Array(Type.String())),
      elementIndex: Type.Optional(Type.Number()),
    },
    { default: { success: true, candidateElementLabels: [] } },
  );

  private historyItem: IWebAgentNavigationHistoryItem | undefined;

  override async pageActionCall(
    input: Static<typeof this.inputSchema>,
    agent: IWebAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const elementIndex = input.elementIndex || 0;
    const { match, candidates } = await getBestElementByText({
      page: agent.page,
      text: input.elementText,
      // role: input.elementRole,
      exact: true,
    });

    if (match) {
      await match.click();
      if (candidates) {
        return {
          success: true,
          candidateElementLabels: (
            await Promise.all(
              candidates.map(
                async (candidate) => await candidate.textContent(),
              ),
            )
          ).filter(notEmpty),
          elementIndex,
        };
      }
      return {
        success: true,
      };
    }

    const { match: matchNonExact, candidates: candidatesNonExact } =
      await getBestElementByText({
        page: agent.page,
        text: input.elementText,
        // role: input.elementRole,
        exact: false,
      });

    if (matchNonExact) {
      await matchNonExact.click();
      if (candidatesNonExact) {
        return {
          success: true,
          candidateElementLabels: (
            await Promise.all(
              candidatesNonExact.map(
                async (candidate) => await candidate.textContent(),
              ),
            )
          ).filter(notEmpty),
          elementIndex,
        };
      }
      return {
        success: true,
      };
    }

    return { success: false };
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
