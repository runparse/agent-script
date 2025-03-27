import { ICodeAgent } from '../types';
import { schemaToTypeString } from '../utils';
import { BaseStoppingUdf } from './baseStoppingUdf';
import { Type, Static, TSchema } from '@sinclair/typebox';

export class FinalAnswerUdf extends BaseStoppingUdf {
  name = 'finalAnswer';
  description: string;

  inputSchema: TSchema = Type.Object({
    answer: Type.String({ description: 'The final answer to the task' }),
  });
  outputSchema: TSchema;
  output: any;

  constructor({
    answerSchema,
    description,
  }: {
    answerSchema?: TSchema;
    description?: string;
  } = {}) {
    super();
    if (answerSchema) {
      this.inputSchema = answerSchema;
    }
    this.outputSchema = this.inputSchema;
    this.description =
      description ||
      `Provide the final answer in the following format: ${schemaToTypeString(
        this.outputSchema,
      )}`;
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    this.output = input;
    return JSON.parse(JSON.stringify(this.output));
  }
}
