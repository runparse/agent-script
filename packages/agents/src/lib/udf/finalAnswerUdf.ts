import { ICodeAgent } from '../types';
import { BaseUdf } from './baseUdf';
import { Type, Static } from '@sinclair/typebox';

export class FinalAnswerUdf extends BaseUdf {
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
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    this.output = input.answer;
    return this.output;
  }
}
