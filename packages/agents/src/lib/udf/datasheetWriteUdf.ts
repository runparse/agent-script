import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';
export class DatasheetWriteUdf extends BaseUdf {
  name = 'datasheetWrite';

  description = 'Write data entries to the notebook';

  inputSchema = Type.Array(Type.Any());

  outputSchema = Type.Object(
    {
      successCount: Type.Number(),
      errorCount: Type.Number(),
      totalSuccessCount: Type.Number(),
    },
    { default: { successCount: 0, errorCount: 0, totalSuccessCount: 0 } },
  );

  entries: Array<any> = [];

  constructor(exampleObject: any) {
    super();
    this.inputSchema.default = [exampleObject];
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    this.entries.push(...input);

    return {
      successCount: input.length,
      errorCount: 0,
      totalSuccessCount: this.entries.length,
    };
  }
}
