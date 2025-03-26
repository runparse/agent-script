import { Static, TSchema } from '@sinclair/typebox';
import { ChatCompletionMessageParam } from 'token.js';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

export interface IAgentLogger {
  level: LogLevel;
  console: Console;

  log(...args: any[]): void;
  logMarkdown({ title, content }: { title?: string; content: string }): void;
  logRule(title: string, level?: LogLevel): void;
  logTask(content: string): void;
  logMessages(messages: IChatMessage[] | null): void;
}

export interface IChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
  raw?: {
    role: 'assistant';
    content: string | null;
    tool_calls?: {
      type: 'function';
      function: { arguments: string; name: string };
    }[];
  };
}

export interface IAgentError extends Error {
  code: string;
}

export interface IMemoryStep {
  toMessages({
    summaryMode,
    showModelInputMessages,
  }: {
    summaryMode: boolean;
    showModelInputMessages: boolean;
  }): IChatMessage[];
}

export interface IObservationMetadata {
  context?: string;
  source?: string;
}

export interface IObservationText extends IObservationMetadata {
  type: 'text';
  text: string;
}

export interface IObservationImage extends IObservationMetadata {
  type: 'image';
  image: string;
}

export type Observation = IObservationText | IObservationImage;

export interface IActionStep extends IMemoryStep {
  modelInputMessages?: IChatMessage[];
  startTime?: number;
  endTime?: number;
  stepNumber: number;
  error?: IAgentError;
  duration?: number;
  modelOutputMessage?: IChatMessage;
  modelOutput?: string;
  observations: Observation[];
  actionOutput?: any;
}

export interface IPlanningStep extends IMemoryStep {
  modelInputMessages: IChatMessage[];
  modelOutputMessageFacts: IChatMessage;
  facts: string;
  modelOutputMessagePlan: IChatMessage;
  plan: string;
}

export interface ITaskStep extends IMemoryStep {
  task: string;
  observations: Observation[];
}

export interface ISystemPromptStep extends IMemoryStep {
  systemPrompt: string;
}

export type AgentMemoryStep =
  | IActionStep
  | IPlanningStep
  | ITaskStep
  | ISystemPromptStep;

export interface IAgentMemory {
  systemPrompt: ISystemPromptStep;
  steps: AgentMemoryStep[];
  logger: IAgentLogger;

  reset(): void;
  getSuccinctSteps(): IChatMessage[];
  replay(logger: IAgentLogger, detailed?: boolean): void;
}

export interface IChatResponseMetadata {
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IChatModel {
  chatCompletion(
    request: {
      messages: ChatCompletionMessageParam[];
    } & Partial<ChatCompletionCreateParamsNonStreaming>,
  ): Promise<{
    message: IChatMessage;
    metadata: IChatResponseMetadata;
  }>;
  chatCompletionWithSchema(
    request: {
      messages: ChatCompletionMessageParam[];
    } & Partial<ChatCompletionCreateParamsNonStreaming>,
  ): Promise<{
    message: IChatMessage;
    metadata: IChatResponseMetadata;
  }>;
}

export interface IAgentPrompt {
  systemPrompt: string;
  planning: {
    initialFacts: string;
    initialPlan: string;
    updateFactsPreMessages: string;
    updateFactsPostMessages: string;
    updatePlanPreMessages: string;
    updatePlanPostMessages: string;
  };
  managedAgent: {
    task: string;
    report: string;
  };
  finalAnswer: {
    preMessages: string;
    postMessages: string;
  };
}

export interface IUdf {
  name: string;
  description: string;
  inputSchema: TSchema;
  outputSchema: TSchema;
  getSignature(): string;

  onBeforeCall(
    input: Static<this['inputSchema']>,
    agent: IAgent,
  ): Promise<void>;

  onAfterCall(
    input: Static<this['inputSchema']>,
    output: Static<this['outputSchema']>,
    agent: IAgent,
  ): Promise<void>;

  call(
    input: Static<this['inputSchema']>,
    agent: IAgent,
  ): Promise<Static<this['outputSchema']>> | Static<this['outputSchema']>;
}

export interface ICallableResult {
  returnValue: unknown;
  callable: string;
}

export interface ISandbox {
  register(callable: string, fn: (...fnArgs: any[]) => Promise<any>): void;
  executeScript(script: string): Promise<{
    calls: ICallableResult[];
    returnValue: any;
    output: string;
  }>;
}

export interface IAgent {
  name: string;
  description: string;
  get task(): string;
  outputSchema: TSchema;
  call: (task: string, ...args: any[]) => Promise<Static<this['outputSchema']>>;
}

export interface ICodeAgent extends IAgent {
  memory: IAgentMemory;
  prompts: IAgentPrompt;
  sandbox: ISandbox;
  udfs: IUdf[];
  managedAgents: IAgent[];
  stepNumber: number;
  maxSteps: number;
  beforeStep(): Promise<void>;
  afterStep(): Promise<void>;
  run: (
    task: string,
    options?: { observations?: Observation[] },
  ) => Promise<Static<this['outputSchema']>>;
  model: IChatModel;
  planningInterval?: number;
  updateShouldRunPlanning(override?: boolean): void;
  logger: IAgentLogger;
}
