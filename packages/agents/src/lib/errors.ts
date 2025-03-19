import { IAgentError } from './types';

export class ChatCompletionError extends Error {
  originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.originalError = originalError;
  }
}

export enum AgentErrorCode {
  UDF_NOT_FOUND = 'UDF_NOT_FOUND',
  SCRIPT_EXECUTION_FAILED = 'SCRIPT_EXECUTION_FAILED',
  PARSING_ERROR = 'PARSING_ERROR',
  MANAGED_AGENT_ERROR = 'MANAGED_AGENT_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  UDF_EXECUTION_ERROR = 'UDF_EXECUTION_ERROR',
  MAX_STEPS_REACHED = 'MAX_STEPS_REACHED',
  MODEL_OUTPUT_ERROR = 'MODEL_OUTPUT_ERROR',
  INVALID_CODE_PATTERN = 'INVALID_CODE_PATTERN',
  INVALID_UDF_INPUT_SCHEMA = 'INVALID_UDF_INPUT_SCHEMA',
  PREMATURE_TERMINATE = 'PREMATURE_TERMINATE',
}

export class AgentError implements IAgentError {
  public message: string;
  public code: string;
  constructor({ message, code }: { message: string; code: string }) {
    this.message = message;
    this.code = code;
  }
}
