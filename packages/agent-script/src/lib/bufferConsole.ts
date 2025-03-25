import { Console } from 'console';
import { Writable } from 'stream';

export class BufferConsole {
  private buffer: string[] = [];
  private stream: Writable;
  private console: Console;

  constructor() {
    this.stream = new Writable({
      write: (chunk, encoding, callback) => {
        this.buffer.push(chunk.toString());
        callback();
      },
    });
    this.console = new Console(this.stream);
  }

  log(...args: any[]) {
    this.console.log(...args);
  }

  getOutput(): string {
    return this.buffer
      .join('')
      .replace(
        /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        '',
      );
  }
}
