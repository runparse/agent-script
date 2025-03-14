import { IMultiStepAgent, ITool } from '../types';
import { Static, TSchema } from '@sinclair/typebox';
import { typeboxToTsString } from '../utils';

export abstract class BaseTool<
  TInputSchema extends TSchema = any,
  TOutputSchema extends TSchema = any,
> implements ITool<TInputSchema, TOutputSchema>
{
  abstract name: string;
  abstract description: string;
  abstract inputSchema: TInputSchema;
  abstract outputSchema?: TOutputSchema;

  getSignature(): string {
    return `// ${this.description}\nasync function ${
      this.name
    }(params: ${typeboxToTsString(this.inputSchema)})`;
  }

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
