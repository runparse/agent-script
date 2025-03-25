import { Console } from 'console';
import { IChatMessage, IAgentLogger, LogLevel } from './types';

export class AgentLogger implements IAgentLogger {
  level: LogLevel;
  console: Console;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
    this.console = new Console(process.stdout, process.stderr);
  }

  log(...args: any[]): void {
    this.console.log(...args);
  }

  logMarkdown({ title, content }: { title?: string; content: string }): void {
    if (title) {
      this.console.log(`\n${title}\n${content}\n`);
    } else {
      this.console.log(`\n${content}\n`);
    }
  }

  logRule(title: string): void {
    this.console.log(`\n${'-'.repeat(20)}\n${title}\n${'-'.repeat(20)}\n`);
  }

  logTask(content: string): void {
    this.console.log(`\nNew task: ${content}\n`);
  }

  logMessages(messages: IChatMessage[] | null): void {
    if (!messages) return;
    this.console.log('\nMessages:');
    messages.forEach((message) => {
      this.console.log(JSON.stringify(message, null, 2));
    });
    this.console.log('\n');
  }
}
