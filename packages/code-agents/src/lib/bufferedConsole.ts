import { Console } from 'console';
import { Writable } from 'stream';

export class BufferedConsole {
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
    return this.buffer.join('');
  }
}
