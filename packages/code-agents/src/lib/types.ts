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
  logTask(
    content: string,
    subtitle: string,
    level?: number,
    title?: string,
  ): void;
  logMessages(messages: IChatMessage[] | null): void;
}

export interface IToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: any;
  };
}

export interface IChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool-call' | 'tool-response';
  content: string;
  images?: string[];
  toolCalls?: IToolCall[];
  raw?: any;
}

export interface ITool<
  TInputSchema extends TSchema = any,
  TOutputSchema extends TSchema = any,
> {
  name: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema?: TOutputSchema;
  getSignature(): string;

  onBeforeCall(
    input: Static<TInputSchema>,
    agent: IMultiStepAgent,
  ): Promise<void>;

  onAfterCall(
    input: Static<TInputSchema>,
    output: Static<TOutputSchema>,
    agent: IMultiStepAgent,
  ): Promise<void>;

  call(
    input: Static<TInputSchema>,
    agent: IMultiStepAgent,
  ): Promise<Static<TOutputSchema>>;
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
  toolCalls?: IToolCall[];
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

export interface IMultiStepAgent<TOutputSchema extends TSchema = any> {
  task: string;
  name: string;
  description: string;
  tools: ITool[];
  memory: IAgentMemory;
  outputSchema?: TOutputSchema;
  prompts: IAgentPrompt;
  stepNumber: number;
  maxSteps: number;
  maxMemoryTokenCount: number;
  managedAgents: IMultiStepAgent<any>[];
  model: IChatModel;
  verbosity: LogLevel;
  planningInterval?: number;
  provideRunSummary: boolean;
  logger: IAgentLogger;

  beforeStep?: (lastStep?: AgentMemoryStep) => Promise<void>;
  afterStep?: (step: AgentMemoryStep) => Promise<void>;
  run: (
    task: string,
    { images, additionalData }: { images?: string[]; additionalData?: any },
  ) => Promise<Static<TOutputSchema>>;
  call: (task: string, args: any) => Promise<string>;
}
