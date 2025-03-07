import { IMultiStepAgent, ITool } from '../types';
import { Static, TSchema } from '@sinclair/typebox';

export abstract class BaseTool<
  TInputSchema extends TSchema = any,
  TOutputSchema extends TSchema = any,
> implements ITool<TInputSchema, TOutputSchema>
{
  abstract name: string;
  abstract description: string;
  abstract inputSchema: TInputSchema;
  abstract outputSchema?: TOutputSchema;

  abstract call(
    input: Static<TInputSchema>,
    agent: IMultiStepAgent,
  ): Promise<Static<TOutputSchema>>;

  async onBeforeCall(
    input: Static<TInputSchema>,
    agent: IMultiStepAgent,
  ): Promise<void> {}

  async onAfterCall(
    input: Static<TInputSchema>,
    output: Static<TOutputSchema>,
    agent: IMultiStepAgent,
  ): Promise<void> {}
}
