import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';
import { formatBytes } from '../utils';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class SaveDataUdf extends BaseUdf {
  name = 'saveData';

  description = 'Save data to a file';

  inputSchema = Type.Object({
    data: Type.Any({
      description: 'The data to save',
    }),
    filename: Type.String({
      description: 'The filename for the data',
    }),
    description: Type.String({
      description: 'Description of the data',
    }),
  });

  outputSchema = Type.Any();

  files: { filename: string; description: string }[] = [];

  private backend: IStorageBackend;

  constructor(options: { backend?: IStorageBackend } = {}) {
    super();
    this.backend = options.backend || new LocalStorageBackend();
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const content = JSON.stringify(input.data);

    this.backend.writeFile(input.filename, Buffer.from(content));
    this.files.push({
      filename: input.filename,
      description: input.description,
    });

    return {
      success: true,
      contentSize: formatBytes(content.length),
    };
  }
}

export interface IStorageBackend {
  writeFile(filename: string, data: Buffer): void;
}

export class LocalStorageBackend implements IStorageBackend {
  constructor(
    private tempDir: string = fs.mkdtempSync(
      path.join(os.tmpdir(), 'agent-script'),
    ),
  ) {}

  writeFile(filename: string, data: Buffer) {
    fs.writeFileSync(path.join(this.tempDir, filename), data);
    console.log('Saved data to: ', path.join(this.tempDir, filename));
  }
}
