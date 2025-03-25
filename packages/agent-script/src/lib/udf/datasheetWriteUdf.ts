import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';
import { stableStringify } from '../utils';
export class DatasheetWriteUdf extends BaseUdf {
  name = 'datasheetWrite';

  description = 'Write data entries to the notebook';

  inputSchema = Type.Array(Type.Any());

  outputSchema = Type.Object(
    {
      successCount: Type.Number(),
      totalSuccessCount: Type.Number(),
    },
    { default: { successCount: 0, errorCount: 0, totalSuccessCount: 0 } },
  );

  private entries: Record<string, any> = [];

  constructor(exampleObject: any) {
    super();
    this.inputSchema.default = [exampleObject];
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    let successCount = 0;
    for (const entry of input) {
      const key = stableStringify(entry);
      if (key in this.entries) {
        continue;
      } else {
        this.entries[key] = entry;
        successCount++;
      }
    }

    return {
      successCount,
      totalSuccessCount: Object.keys(this.entries).length,
    };
  }

  getEntries(): Array<any> {
    return Object.values(this.entries);
  }
}
