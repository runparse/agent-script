import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';
import { BaseStoppingUdf } from './baseStoppingUdf';

export class TerminateUdf extends BaseStoppingUdf {
  name = 'terminate';
  description = 'Terminate the agent.';

  inputSchema = Type.Object(
    {
      reason: Type.String({
        description: 'The reason for terminating the task',
      }),
    },
    { default: { reason: 'The task is complete' } },
  );

  outputSchema = Type.String();

  reason: string | undefined;

  override call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Static<typeof this.outputSchema> {
    this.reason = input.reason;
    return this.reason;
  }
}
