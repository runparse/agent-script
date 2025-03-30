import { AgentError } from '@runparse/agent-script';

export class PageActionTimeoutError extends AgentError {
  constructor(timeoutMs: number) {
    super({
      message: `Page action timed out after ${timeoutMs} ms`,
      code: 'PAGE_ACTION_TIMEOUT',
    });
  }
}
