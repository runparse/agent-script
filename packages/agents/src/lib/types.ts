import { Static, TSchema } from '@sinclair/typebox';
import { CompletionNonStreaming, LLMProvider } from 'token.js/dist/chat';
import { ChatCompletionMessageParam } from 'token.js';

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
  logCode(title: string, content: string): void;
  logRule(title: string, level?: LogLevel): void;
  logTask(content: string): void;
  logMessages(messages: IChatMessage[] | null): void;
}

export interface IChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
  raw?: any;
}

export interface IAgentError {
  message: string;
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

export interface IActionStep extends IMemoryStep {
  modelInputMessages?: IChatMessage[];
  startTime?: number;
  endTime?: number;
  stepNumber: number;
  error?: IAgentError;
  duration?: number;
  modelOutputMessage?: IChatMessage;
  modelOutput?: string;
  observations?: string;
  observationsImages?: string[];
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
  taskImages: string[] | null;
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
  getFullSteps(): Record<string, any>[];
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
  chatCompletion<P extends LLMProvider>(
    request: {
      messages: ChatCompletionMessageParam[];
    } & Partial<CompletionNonStreaming<P>>,
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
  udfs: IUdf[];
  managedAgents: IAgent[];
  stepNumber: number;
  maxSteps: number;
  beforeStep(): Promise<void>;
  afterStep(): Promise<void>;
  run: (
    task: string,
    { images, additionalData }: { images?: string[]; additionalData?: any },
  ) => Promise<Static<this['outputSchema']>>;
  model: IChatModel;
  planningInterval?: number;
  updateShouldRunPlanning(override?: boolean): void;
  maxMemoryTokenCount: number;
  logger: IAgentLogger;
}
