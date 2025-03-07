import { IAgentError } from './types';

export class ChatCompletionError extends Error {
  originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.originalError = originalError;
  }
}

export enum AgentErrorCode {
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  SCRIPT_EXECUTION_FAILED = 'SCRIPT_EXECUTION_FAILED',
  PARSING_ERROR = 'PARSING_ERROR',
  MANAGED_AGENT_ERROR = 'MANAGED_AGENT_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  MAX_STEPS_REACHED = 'MAX_STEPS_REACHED',
  MODEL_OUTPUT_ERROR = 'MODEL_OUTPUT_ERROR',
  INVALID_CODE_PATTERN = 'INVALID_CODE_PATTERN',
}

export class AgentError implements IAgentError {
  public message: string;
  public code: string;
  constructor({ message, code }: { message: string; code: string }) {
    this.message = message;
    this.code = code;
  }
}
