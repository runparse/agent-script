import { AgentLogger } from './agentLogger';
import {
  IActionStep,
  AgentMemoryStep,
  IChatMessage,
  IPlanningStep,
  ISystemPromptStep,
  ITaskStep,
  IAgentError,
  Observation,
  IAgentMemory,
} from './types';
import { observationToChatMessage } from './utils';

export class ActionStep implements IActionStep {
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

  constructor({
    modelInputMessages,
    startTime,
    endTime,
    stepNumber,
    error,
    duration,
    modelOutputMessage,
    modelOutput,
    observations,
    actionOutput,
  }: {
    modelInputMessages?: IChatMessage[];
    startTime?: number;
    endTime?: number;
    stepNumber: number;
    error?: IAgentError;
    duration?: number;
    modelOutputMessage?: IChatMessage;
    modelOutput?: string;
    observations?: Observation[];
    actionOutput?: any;
  }) {
    this.modelInputMessages = modelInputMessages;
    this.startTime = startTime;
    this.endTime = endTime;
    this.stepNumber = stepNumber;
    this.error = error;
    this.duration = duration;
    this.modelOutputMessage = modelOutputMessage;
    this.modelOutput = modelOutput;
    this.observations = observations || [];
    this.actionOutput = actionOutput;
  }

  toMessages({
    summaryMode,
    showModelInputMessages,
  }: {
    summaryMode: boolean;
    showModelInputMessages: boolean;
  }): IChatMessage[] {
    const messages: IChatMessage[] = [];

    if (this.modelInputMessages && showModelInputMessages) {
      messages.push({
        role: 'system',
        content: this.modelInputMessages.map((m) => m.content).join('\n'),
      });
    }

    if (this.modelOutput && !summaryMode) {
      messages.push({
        role: 'assistant',
        content: this.modelOutput.trim(),
      });
    }

    messages.push(...this.observations.map(observationToChatMessage));

    if (this.error) {
      const errorMessage =
        'Error:\n' +
        String(this.error.message) +
        "\nNow let's retry: take care not to repeat previous errors! If you have retried several times, try a completely different approach.\n";

      messages.push({
        role: 'user',
        content: errorMessage,
      });
    }

    return messages;
  }
}

export class PlanningStep implements IPlanningStep {
  modelInputMessages: IChatMessage[];
  modelOutputMessageFacts: IChatMessage;
  facts: string;
  modelOutputMessagePlan: IChatMessage;
  plan: string;

  constructor({
    modelInputMessages,
    modelOutputMessageFacts,
    facts,
    modelOutputMessagePlan,
    plan,
  }: {
    modelInputMessages: IChatMessage[];
    modelOutputMessageFacts: IChatMessage;
    facts: string;
    modelOutputMessagePlan: IChatMessage;
    plan: string;
  }) {
    this.modelInputMessages = modelInputMessages;
    this.modelOutputMessageFacts = modelOutputMessageFacts;
    this.facts = facts;
    this.modelOutputMessagePlan = modelOutputMessagePlan;
    this.plan = plan;
  }

  toMessages({
    summaryMode,
    showModelInputMessages,
  }: {
    summaryMode: boolean;
    showModelInputMessages: boolean;
  }): IChatMessage[] {
    const messages: IChatMessage[] = [];

    messages.push({
      role: 'assistant',
      content: `[FACTS LIST]:\n${this.facts.trim()}`,
    });

    if (!summaryMode) {
      // This step is not shown to a model writing a plan to avoid influencing the new plan
      messages.push({
        role: 'assistant',
        content: `[PLAN]:\n${this.plan.trim()}`,
      });
    }

    return messages;
  }
}

export class TaskStep implements ITaskStep {
  task: string;
  observations: Observation[];

  constructor({
    task,
    observations,
  }: {
    task: string;
    observations?: Observation[];
  }) {
    this.task = task;
    this.observations = observations || [];
  }

  toMessages({
    summaryMode,
    showModelInputMessages,
  }: {
    summaryMode: boolean;
    showModelInputMessages: boolean;
  }): IChatMessage[] {
    const messages: IChatMessage[] = [];

    const content = `New task:\n${this.task}`;
    messages.push({
      role: 'user',
      content: content,
    });

    return messages;
  }
}

export class SystemPromptStep implements ISystemPromptStep {
  systemPrompt: string;

  constructor({ systemPrompt }: { systemPrompt: string }) {
    this.systemPrompt = systemPrompt;
  }

  toMessages({
    summaryMode,
    showModelInputMessages,
  }: {
    summaryMode: boolean;
    showModelInputMessages: boolean;
  }): IChatMessage[] {
    if (summaryMode) {
      return [];
    }

    return [
      {
        role: 'system',
        content: this.systemPrompt,
      },
    ];
  }
}

export class AgentMemory implements IAgentMemory {
  public systemPrompt: SystemPromptStep;
  public steps: AgentMemoryStep[];
  public logger: AgentLogger = new AgentLogger();

  constructor(systemPrompt: string) {
    this.systemPrompt = new SystemPromptStep({ systemPrompt });
    this.steps = [];
  }

  reset() {
    this.steps = [];
  }

  getSuccinctSteps(): IChatMessage[] {
    return this.steps.flatMap((step) =>
      step.toMessages({ summaryMode: true, showModelInputMessages: false }),
    );
  }

  replay(logger: AgentLogger, detailed = false) {
    logger.console.log("Replaying the agent's steps:");

    for (const step of this.steps) {
      if (step instanceof SystemPromptStep && detailed) {
        logger.logMarkdown({
          title: 'System prompt',
          content: step.systemPrompt,
        });
      } else if (step instanceof TaskStep) {
        logger.logTask(step.task);
      } else if (step instanceof ActionStep) {
        logger.logRule(`Step ${step.stepNumber}`);
        if (detailed) {
          logger.logMessages(step.modelInputMessages || null);
        }
        logger.logMarkdown({
          title: 'Agent output:',
          content: step.modelOutput || '',
        });
      } else if (step instanceof PlanningStep) {
        logger.logRule('Planning step');
        if (detailed) {
          logger.logMessages(step.modelInputMessages);
        }
        logger.logMarkdown({
          title: 'Agent output:',
          content: `${step.facts}\n${step.plan}`,
        });
      }
    }
  }
}
