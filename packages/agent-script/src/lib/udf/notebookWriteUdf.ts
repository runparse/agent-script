import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';
import { formatBytes } from '../utils';

export class NotebookWriteUdf extends BaseUdf {
  name = 'notebookWrite';

  description = 'Write text and objects to the notebook';

  inputSchema = Type.Any();

  outputSchema = Type.Object({});

  content: Buffer = Buffer.from('');

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    switch (typeof input) {
      case 'string':
      case 'number':
      case 'boolean':
        this.content = Buffer.concat([
          this.content,
          Buffer.from(input.toString()),
        ]);
        break;
      case 'object':
        this.content = Buffer.concat([
          this.content,
          Buffer.from(JSON.stringify(input, null, 2)),
        ]);
        break;
    }

    return {
      success: true,
      contentSize: formatBytes(this.content.length),
    };
  }
}
