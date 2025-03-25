import { ICodeAgent } from '../types';
import { BaseUdf } from './baseUdf';
import { Type, Static } from '@sinclair/typebox';

export class TerminateUdf extends BaseUdf {
  name = 'terminate';
  description = 'Terminate the agent.';

  inputSchema = Type.Object(
    {
      reason: Type.String({
        description: 'The reason for terminating the task.',
      }),
    },
    { default: { reason: 'The task is complete.' } },
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
