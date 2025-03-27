import { Type, Static } from '@sinclair/typebox';
import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';

export class ThinkUdf extends BaseUdf {
  name = 'think';
  description =
    'Reflect on the steps taken so far and update the plan if improvements / changes should be made';

  inputSchema = Type.Any();
  outputSchema = Type.Any();

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    agent.updateShouldRunPlanning(true);
    return 'Thinking...';
  }
}
