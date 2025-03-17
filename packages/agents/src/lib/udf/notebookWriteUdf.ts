import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';

export class NotebookWriteUdf extends BaseUdf {
  name = 'notebookWrite';

  description = 'Write strings and objects to the notebook';

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
      contentSize: this.formatBytes(this.content.length),
    };
  }

  private formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(decimals))} ${
      sizes[i]
    }`;
  }
}
