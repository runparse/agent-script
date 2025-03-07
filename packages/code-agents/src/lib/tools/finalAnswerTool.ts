import { IMultiStepAgent } from '../types';
import { BaseTool } from './baseTool';
import { Type, TString, TObject, Static } from '@sinclair/typebox';

export class FinalAnswerTool extends BaseTool<
  TObject<{ answer: TString }>,
  TString
> {
  name = 'finalAnswer';
  description = 'Provide the final answer to the user.';

  inputSchema = Type.Object(
    {
      answer: Type.String(),
    },
    { default: { answer: 'string' } },
  );

  outputSchema = Type.String();

  output: string | undefined;

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IMultiStepAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    this.output = input.answer;
    return this.output;
  }
}
