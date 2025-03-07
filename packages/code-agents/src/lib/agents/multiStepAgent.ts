import nunjucks from 'nunjucks';
import {
  IAgentPrompt,
  IChatModel,
  IMultiStepAgent,
  ITool,
  AgentMemoryStep,
  LogLevel,
  IChatMessage,
  IAgentLogger,
  IAgentMemory,
} from '../types';
import {
  ActionStep,
  AgentMemory,
  PlanningStep,
  SystemPromptStep,
  TaskStep,
} from '../agentMemory';
import { toChatCompletionMessageParam, truncateContent } from '../utils';
import { TypeBoxError } from '@sinclair/typebox';
import { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { AgentError, AgentErrorCode } from '../errors';
import { AgentLogger } from '../agentLogger';
import { ChatModel } from '..';

export interface IMultiStepAgentProps<TOutputSchema extends TSchema> {
  task: string;
  name: string;
  description: string;
  tools: ITool[];
  prompts: IAgentPrompt;
  maxSteps: number;
  maxMemoryTokenCount?: number;
  memory?: IAgentMemory;
  model?: IChatModel;
  outputSchema?: TOutputSchema;
  managedAgents?: IMultiStepAgent<any>[];
  provideRunSummary?: boolean;
  verbosity?: LogLevel;
  planningInterval?: number;
  logger?: IAgentLogger;
}

export abstract class MultiStepAgent<TOutputSchema extends TSchema>
  implements IMultiStepAgent<TOutputSchema>
{
  task: string;
  name: string;
  description: string;
  tools: ITool<any, any>[];
  model: IChatModel;
  prompts: IAgentPrompt;
  memory: AgentMemory;
  outputSchema?: TOutputSchema;
  maxSteps: number;
  maxMemoryTokenCount: number;
  managedAgents: IMultiStepAgent<any>[];
  verbosity: LogLevel;
  stepNumber: number;
  planningInterval?: number;
  provideRunSummary: boolean;
  logger: IAgentLogger;

  beforeStep?: (lastStep?: AgentMemoryStep) => Promise<void>;
  afterStep?: (step: AgentMemoryStep) => Promise<void>;

  constructor(props: IMultiStepAgentProps<TOutputSchema>) {
    this.task = props.task;
    this.name = props.name;
    this.description = props.description;
    this.tools = props.tools;
    this.prompts = props.prompts;
    this.maxSteps = props.maxSteps;
    this.maxMemoryTokenCount = props.maxMemoryTokenCount || 100000;
    this.model =
      props.model ||
      new ChatModel({
        provider: 'openai',
        model: 'gpt-4o',
      });
    this.memory =
      props.memory ||
      new AgentMemory(
        nunjucks.renderString(this.prompts.systemPrompt, {
          task: this.task,
          tools: this.tools,
          managedAgents: props.managedAgents,
          description: this.description,
        }),
      );
    this.outputSchema = props.outputSchema;
    this.managedAgents = props.managedAgents || [];
    this.verbosity = props.verbosity || LogLevel.INFO;
    this.provideRunSummary = props.provideRunSummary || false;
    this.planningInterval = props.planningInterval;
    this.logger = props.logger || new AgentLogger();

    this.stepNumber = 0;
  }

  writeMemoryToMessages(summaryMode = false): IChatMessage[] {
    /**
     * Reads past llm_outputs, actions, and observations or errors from the memory into a series of messages
     * that can be used as input to the LLM. Adds a number of keywords (such as PLAN, error, etc) to help
     * the LLM.
     */
    const messages = this.memory.systemPrompt.toMessages({
      summaryMode,
      showModelInputMessages: false,
    });

    for (const memoryStep of this.memory.steps) {
      messages.push(
        ...memoryStep.toMessages({
          summaryMode,
          showModelInputMessages: false,
        }),
      );
    }

    return messages;
  }

  /**
   * Provide the final answer to the task, based on the logs of the agent's interactions.
   *
   * @param task Task to perform
   * @param images Optional paths to images
   * @returns Final answer to the task
   */
  async provideFinalAnswer(task: string, images?: string[]): Promise<string> {
    const messages: IChatMessage[] = [
      {
        role: 'system',
        content: this.prompts.finalAnswer.preMessages,
      },
    ];

    if (images?.length) {
      // Add image content if images are provided
      messages[0]!.content += '\n[Image content]';
    }

    // Add memory messages, excluding the first system message
    messages.push(...this.writeMemoryToMessages().slice(1));

    // Add final user message
    messages.push({
      role: 'user',
      content: nunjucks.renderString(this.prompts.finalAnswer.postMessages, {
        task,
      }),
    });

    try {
      const { message } = await this.model.chatCompletion({
        messages: toChatCompletionMessageParam(messages),
      });
      return message.content;
    } catch (error) {
      return `Error in generating final LLM output:\n${error}`;
    }
  }

  /**
   * Execute tool with the provided input and returns the result.
   * This method replaces arguments with the actual values from the state if they refer to state variables.
   *
   * @param toolName Name of the Tool to execute (should be one from this.tools)
   * @param arguments Arguments passed to the Tool
   * @returns Result from executing the tool
   */
  async executeToolCall<
    TToolInput extends TSchema,
    TToolOutput extends TSchema,
  >(toolName: string, input: TToolInput): Promise<Static<TToolOutput>> {
    const managedAgent = this.managedAgents.find(
      (a) => a.name === toolName,
    ) as IMultiStepAgent;

    if (managedAgent) {
      try {
        return managedAgent.call(this.task, input);
      } catch (error: any) {
        const errorMsg = `Error in calling team member: ${error.message}\nYou should only ask this team member with a correct request.\nAs a reminder, this team member's description is the following:\n${managedAgent.description}`;
        throw new AgentError({
          message: errorMsg,
          code: AgentErrorCode.MANAGED_AGENT_ERROR,
        });
      }
    }

    const tool = this.tools.find((t) => t.name === toolName) as ITool<
      TToolInput,
      TToolOutput
    >;

    if (!tool) {
      throw new AgentError({
        message: `Tool ${toolName} not found`,
        code: AgentErrorCode.TOOL_NOT_FOUND,
      });
    }

    try {
      // Validate input against schema
      Value.Assert(tool.inputSchema, input);
      await tool.onBeforeCall(input, this);
      const output = await tool.call(input, this);
      await tool.onAfterCall(input, output, this);
      return output;
    } catch (error: any) {
      if (error instanceof TypeBoxError) {
        throw new AgentError({
          message: `Invalid input for tool ${toolName}: ${error.message}`,
          code: AgentErrorCode.INVALID_INPUT,
        });
      }

      if (tool) {
        const errorMsg = `Error when executing tool ${toolName} with arguments ${JSON.stringify(
          input,
        )}: ${error.name}: ${
          error.message
        }\nYou should only use this tool with a correct input.\nAs a reminder, this tool's description is the following: '${
          tool.description
        }'.\nIt takes inputs: ${JSON.stringify(
          tool.inputSchema,
        )} and returns output type ${
          tool.outputSchema?.description ?? 'unknown'
        }`;
        throw new AgentError({
          message: errorMsg,
          code: AgentErrorCode.TOOL_EXECUTION_ERROR,
        });
      }
      throw error;
    }
  }

  /**
   * Run the agent and return a generator of all steps.
   *
   * @param task Task to perform
   * @param images Optional paths to images
   * @returns Generator of memory steps and final output
   */
  async run(
    task: string,
    { images }: { images?: string[] },
  ): Promise<Static<TOutputSchema>> {
    let finalAnswer: Static<TOutputSchema> | undefined = undefined;
    this.task = task;
    this.stepNumber = 1;
    this.memory.systemPrompt = new SystemPromptStep({
      systemPrompt: nunjucks.renderString(this.prompts.systemPrompt, {
        task: this.task,
        tools: this.tools,
        managedAgents: this.managedAgents,
        description: this.description,
      }),
    });
    this.logger.logTask(
      this.task.trim(),
      `${this.model.constructor.name} - ${(this.model as any).modelId || ''}`,
      LogLevel.INFO,
      this.name,
    );

    this.memory.steps.push(
      new TaskStep({ task: this.task, taskImages: images }),
    );

    while (finalAnswer === undefined && this.stepNumber <= this.maxSteps) {
      const stepStartTime = Date.now();
      const memoryStep = new ActionStep({
        stepNumber: this.stepNumber,
        startTime: stepStartTime,
        observationsImages: images,
      });
      this.memory.steps.push(memoryStep);

      try {
        if (
          this.planningInterval &&
          this.stepNumber % this.planningInterval == 1
        ) {
          this.planningStep();
        }
        this.logger.logRule(`Step ${this.stepNumber}`, LogLevel.INFO);
        // Run one step
        if (this.beforeStep) {
          await this.beforeStep(
            this.memory.steps[this.memory.steps.length - 1],
          );
        }

        finalAnswer = await this.step(memoryStep);

        if (this.afterStep) {
          await this.afterStep(memoryStep);
        }
      } catch (error: any) {
        if (error instanceof AgentError) {
          memoryStep.error = error;
        } else {
          throw error;
        }
      } finally {
        memoryStep.endTime = Date.now();
        memoryStep.duration = memoryStep.endTime - stepStartTime;
        this.stepNumber++;
      }
    }

    if (finalAnswer === undefined && this.stepNumber > this.maxSteps) {
      const errorMsg = 'Reached max steps';
      const finalMemoryStep = new ActionStep({
        stepNumber: this.stepNumber,
        error: new AgentError({
          message: errorMsg,
          code: AgentErrorCode.MAX_STEPS_REACHED,
        }),
      });
      finalMemoryStep.endTime = Date.now();
      this.memory.steps.push(finalMemoryStep);
    }

    return finalAnswer as Static<TOutputSchema>;
  }

  /**
   * Used periodically by the agent to plan the next steps to reach the objective.
   *
   * @param task Task to perform
   * @param isFirstStep If this step is not the first one, the plan should be an update over a previous plan
   * @param step The number of the current step, used as an indication for the LLM
   */
  async planningStep(): Promise<void> {
    if (this.stepNumber == 1) {
      // Initial planning
      const messagePromptFacts: IChatMessage = {
        role: 'system',
        content: this.prompts.planning.initialFacts,
      };

      const messagePromptTask: IChatMessage = {
        role: 'user',
        content: `Here is the task:\n\`\`\`\n${this.task}\n\`\`\`\nNow begin!`,
      };

      const inputMessages = [messagePromptFacts, messagePromptTask];
      const { message: chatMessageFacts } = await this.model.chatCompletion({
        messages: toChatCompletionMessageParam(inputMessages),
      });
      const answerFacts = chatMessageFacts.content;

      const messagePromptPlan: IChatMessage = {
        role: 'user',
        content: nunjucks.renderString(this.prompts.planning.initialPlan, {
          task: this.task,
          tools: this.tools,
          managedAgents: this.managedAgents,
          answerFacts: answerFacts,
        }),
      };

      const { message: chatMessagePlan } = await this.model.chatCompletion({
        messages: toChatCompletionMessageParam([messagePromptPlan]),
        stop: ['<end_plan>'],
      });
      const answerPlan = chatMessagePlan.content;

      const finalPlanRedaction = `Here is the plan of action that I will follow to solve the task:\n\`\`\`\n${answerPlan}\n\`\`\``;
      const finalFactsRedaction =
        `Here are the facts that I know so far:\n\`\`\`\n${answerFacts}\n\`\`\``.trim();

      const planningStep = new PlanningStep({
        modelInputMessages: inputMessages,
        plan: finalPlanRedaction,
        facts: finalFactsRedaction,
        modelOutputMessagePlan: chatMessagePlan,
        modelOutputMessageFacts: chatMessageFacts,
      });

      this.memory.steps.push(planningStep);
      this.logger.logRule('Initial plan', LogLevel.INFO);
      this.logger.log(finalPlanRedaction);
    } else {
      // Update plan
      // Do not take the system prompt message from the memory
      // summary_mode=False: Do not take previous plan steps to avoid influencing the new plan
      const memoryMessages = this.writeMemoryToMessages().slice(1);

      // Redact updated facts
      const factsUpdatePreMessages: IChatMessage = {
        role: 'system',
        content: this.prompts.planning.updateFactsPreMessages,
      };

      const factsUpdatePostMessages: IChatMessage = {
        role: 'user',
        content: this.prompts.planning.updateFactsPostMessages,
      };

      const inputMessages = [
        factsUpdatePreMessages,
        ...memoryMessages,
        factsUpdatePostMessages,
      ];
      const { message: chatMessageFacts } = await this.model.chatCompletion({
        messages: toChatCompletionMessageParam(inputMessages),
      });
      const factsUpdate = chatMessageFacts.content;

      // Redact updated plan
      const updatePlanPreMessages: IChatMessage = {
        role: 'system',
        content: nunjucks.renderString(
          this.prompts.planning.updatePlanPreMessages,
          {
            task: this.task,
          },
        ),
      };

      const updatePlanPostMessages: IChatMessage = {
        role: 'user',
        content: nunjucks.renderString(
          this.prompts.planning.updatePlanPostMessages,
          {
            task: this.task,
            tools: this.tools,
            managedAgents: this.managedAgents,
            factsUpdate: factsUpdate,
            remainingSteps: this.maxSteps - this.stepNumber,
          },
        ),
      };

      const { message: chatMessagePlan } = await this.model.chatCompletion({
        messages: toChatCompletionMessageParam([
          updatePlanPreMessages,
          ...memoryMessages,
          updatePlanPostMessages,
        ]),
        stop: ['<end_plan>'],
      });

      // Log final facts and plan
      const finalPlanRedaction = `I still need to solve the task I was given:\n\`\`\`\n${this.task}\n\`\`\`\n\nHere is my new/updated plan of action to solve the task:\n\`\`\`\n${chatMessagePlan.content}\n\`\`\``;
      const finalFactsRedaction = `Here is the updated list of the facts that I know:\n\`\`\`\n${factsUpdate}\n\`\`\``;

      const planningStep = new PlanningStep({
        modelInputMessages: inputMessages,
        plan: finalPlanRedaction,
        facts: finalFactsRedaction,
        modelOutputMessagePlan: chatMessagePlan,
        modelOutputMessageFacts: chatMessageFacts,
      });

      this.memory.steps.push(planningStep);
      this.logger.logRule('Updated plan', LogLevel.INFO);
      this.logger.log(finalPlanRedaction);
    }
  }

  /**
   * Prints a pretty replay of the agent's steps.
   *
   * @param detailed If true, also displays the memory at each step. Defaults to false.
   *                 Careful: will increase log length exponentially. Use only for debugging.
   */
  replay(detailed = false): void {
    this.memory.replay(this.logger, detailed);
  }

  /**
   * Adds additional prompting for the managed agent, runs it, and wraps the output.
   * This method is called only by a managed agent.
   *
   * @param task Task to perform
   * @param kwargs Additional arguments to pass to run()
   * @returns Formatted report of the agent's work
   */
  async call(task: string, kwargs: any): Promise<string> {
    const fullTask = nunjucks.renderString(this.prompts.managedAgent.task, {
      name: this.name,
      task,
    });

    const report = await this.run(fullTask, kwargs);

    let answer = nunjucks.renderString(this.prompts.managedAgent.report, {
      name: this.name,
      finalAnswer: String(report),
    });

    if (this.provideRunSummary) {
      answer +=
        "\n\nFor more detail, find below a summary of this agent's work:\n<summary_of_work>\n";

      for (const message of this.writeMemoryToMessages(true)) {
        const content = message.content;
        // Assuming truncateContent is implemented elsewhere
        answer += `\n${truncateContent(String(content))}\n---`;
      }

      answer += '\n</summary_of_work>';
    }

    return answer;
  }

  abstract step(
    memoryStep: AgentMemoryStep,
  ): Promise<Static<TOutputSchema> | undefined>;
}
