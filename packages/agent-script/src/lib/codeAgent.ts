import { Static, TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import nunjucks from 'nunjucks';
import { AgentLogger } from './agentLogger';
import {
  ActionStep,
  AgentMemory,
  PlanningStep,
  SystemPromptStep,
  TaskStep,
} from './agentMemory';
import { ChatModel } from './chatModel';
import { codeAgentPrompt } from './codeAgent.prompt';
import { AgentError, AgentErrorCode } from './errors';
import { Sandbox } from './sandbox';
import {
  IAgent,
  IAgentLogger,
  IAgentPrompt,
  IChatMessage,
  IChatModel,
  ICodeAgent,
  ISandbox,
  IUdf,
  LogLevel,
  Observation,
} from './types';
import { CallAgentUdf } from './udf/index';
import {
  toChatCompletionMessageParam,
  truncateContent,
  walkTypeboxSchema,
} from './utils';
import { BaseStoppingUdf } from './udf/baseStoppingUdf';

export interface ICodeAgentProps {
  name: string;
  description: string;
  udfs: IUdf[];
  authorizedImports?: string[];
  sandbox?: ISandbox;
  prompts?: IAgentPrompt;
  maxSteps: number;
  model?: IChatModel;
  memory?: AgentMemory;
  managedAgents?: IAgent[];
  outputSchema?: TSchema;
  planningInterval?: number;
  shouldRunPlanning?: boolean;
  logger?: IAgentLogger;
}

export class CodeAgent implements ICodeAgent {
  task: string;
  name: string;
  description: string;
  udfs: IUdf[];
  authorizedImports: string[];
  sandbox: ISandbox;
  model: IChatModel;
  prompts: IAgentPrompt;
  memory: AgentMemory;
  outputSchema: TSchema;
  maxSteps: number;
  managedAgents: IAgent[];
  stepNumber: number;
  planningInterval?: number;
  logger: IAgentLogger;

  protected shouldRunPlanning: boolean;

  constructor(props: ICodeAgentProps) {
    this.task = '';
    this.name = props.name;
    this.description = props.description;
    this.udfs = props.udfs;
    if (!this.udfs.some((udf) => udf instanceof BaseStoppingUdf)) {
      throw new AgentError({
        message:
          'The CodeAgent requires at least one stopping UDF (BaseStoppingUdf) to be present in the udfs list.',
        code: AgentErrorCode.UDF_NOT_FOUND,
      });
    }
    this.managedAgents = props.managedAgents || [];
    this.udfs.push(
      ...this.managedAgents.map((agent) => {
        return new CallAgentUdf({
          agentName: agent.name,
          agentDescription: agent.description,
          agentOutputSchema: agent.outputSchema,
        });
      }),
    );
    this.authorizedImports = props.authorizedImports || [];
    this.sandbox = props.sandbox || new Sandbox();
    this.udfs.forEach((udf) => {
      this.sandbox.register(udf.name, (args: any) =>
        this.callUdf(udf.name, args),
      );
    });
    this.prompts = props.prompts || codeAgentPrompt;
    this.maxSteps = props.maxSteps;
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
          udfs: this.udfs,
          managedAgents: props.managedAgents,
          description: this.description,
        }),
      );
    this.outputSchema = props.outputSchema || Type.Any();
    this.planningInterval = props.planningInterval;
    this.logger = props.logger || new AgentLogger();
    this.shouldRunPlanning = props.shouldRunPlanning || false;

    this.stepNumber = 0;

    this.validate();
  }

  protected validate() {
    const warnings: string[] = [];
    for (const udf of this.udfs) {
      walkTypeboxSchema(udf.inputSchema, (schema, schemaPath) => {
        if (
          ['string', 'number', 'boolean', 'null'].includes(schema.type) &&
          !schema.description
        ) {
          warnings.push(
            `UDF ${udf.name} has an input schema ${schemaPath} that is a primitive type but has no description.`,
          );
        }
      });
    }
    if (this.udfs.length > new Set(this.udfs.map((udf) => udf.name)).size) {
      throw new AgentError({
        message: 'UDF names must be unique.',
        code: AgentErrorCode.VALIDATION_ERROR,
      });
    }
    if (warnings.length > 0) {
      console.warn(warnings.join('\n'));
    }
  }

  writeMemoryToMessages(summaryMode = false): IChatMessage[] {
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

  async callUdf(udfName: string, input: any): Promise<Static<TSchema>> {
    const udf = this.udfs.find((t) => t.name === udfName) as IUdf;

    if (!udf) {
      throw new AgentError({
        message: `UDF ${udfName} not found`,
        code: AgentErrorCode.UDF_NOT_FOUND,
      });
    }

    try {
      Value.Assert(udf.inputSchema, input);
      await udf.onBeforeCall(input, this);
      const output = await udf.call(input, this);
      await udf.onAfterCall(input, output, this);
      return output;
    } catch (error: any) {
      const errorMsg = `Error when calling UDF ${udfName} with arguments ${JSON.stringify(
        input,
      )}: ${error.name}: ${
        error.message
      }\nYou should only call this UDF with a correct input.\nAs a reminder, this UDF's description is the following: '${
        udf.description
      }'.\nIt takes inputs: ${JSON.stringify(
        udf.inputSchema,
      )} and returns output type ${udf.outputSchema?.description ?? 'unknown'}`;
      throw new AgentError({
        message: errorMsg,
        code: AgentErrorCode.UDF_EXECUTION_ERROR,
      });
    }
  }

  async run(
    task: string,
    options?: { observations?: Observation[] },
  ): Promise<Static<this['outputSchema']>> {
    const observations = options?.observations;
    let finalAnswer: Static<this['outputSchema']> | undefined = undefined;
    this.task = task;
    this.stepNumber = 1;
    this.memory.systemPrompt = new SystemPromptStep({
      systemPrompt: nunjucks.renderString(this.prompts.systemPrompt, {
        task: this.task,
        udfs: this.udfs,
        managedAgents: this.managedAgents,
        description: this.description,
      }),
    });
    this.logger.logTask(this.task.trim());

    this.memory.steps.push(new TaskStep({ task: this.task, observations }));

    while (
      finalAnswer === undefined &&
      this.stepNumber <= this.maxSteps &&
      !this.errorCircuitBreaker()
    ) {
      if (this.shouldRunPlanning) {
        await this.planningStep();
        continue;
      }

      const stepStartTime = Date.now();
      const memoryStep = new ActionStep({
        stepNumber: this.stepNumber,
        startTime: stepStartTime,
        observations,
      });
      this.memory.steps.push(memoryStep);

      try {
        this.logger.logRule(`Step ${this.stepNumber}`, LogLevel.INFO);
        if (this.beforeStep) {
          await this.beforeStep();
        }

        finalAnswer = await this.step(memoryStep);

        if (this.afterStep) {
          await this.afterStep();
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

    return finalAnswer as Static<this['outputSchema']>;
  }

  /**
   * Used periodically by the agent to plan the next steps to reach the objective.
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
          udfs: this.udfs,
          managedAgents: this.managedAgents,
          answerFacts: answerFacts,
        }),
      };

      const { message: chatMessagePlan } = await this.model.chatCompletion({
        messages: toChatCompletionMessageParam([messagePromptPlan]),
        stop: ['<end_plan>'],
      });
      const answerPlan = chatMessagePlan.content;

      const finalPlanRedaction = `Here is the plan of action that I will follow to solve the task:\n\n${answerPlan}\n`;
      const finalFactsRedaction =
        `Here are the facts that I know so far:\n\n${answerFacts}\n`.trim();

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
            udfs: this.udfs,
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

    this.shouldRunPlanning = false;
  }

  /**
   * Adds additional prompting for the managed agent, runs it, and wraps the output.
   * This method is called only by a managed agent.
   */
  async call(task: string, kwargs: any): Promise<Static<this['outputSchema']>> {
    const fullTask = nunjucks.renderString(this.prompts.managedAgent.task, {
      name: this.name,
      task,
    });

    const report = await this.run(fullTask, kwargs);

    let answer = nunjucks.renderString(this.prompts.managedAgent.report, {
      name: this.name,
      finalAnswer: String(report),
    });

    return answer;
  }

  protected errorCircuitBreaker(): boolean {
    const actionSteps = this.memory.steps.filter(
      (step) => step instanceof ActionStep,
    ) as ActionStep[];
    const lastActionStep = actionSteps[actionSteps.length - 1];
    if (lastActionStep && lastActionStep.error) {
      // Check if the last 3 action steps have the same error
      if (actionSteps.length >= 3) {
        const lastThreeSteps = actionSteps.slice(-3);

        // Ensure all last three steps have errors
        if (lastThreeSteps.every((step) => step.error)) {
          // Compare error messages to check if they're the same
          const errorMessage = lastActionStep.error.message;
          return lastThreeSteps.every(
            (step) => step.error?.message === errorMessage,
          );
        }
      }
      return false;
    }
    return false;
  }

  async step(
    memoryStep: ActionStep,
  ): Promise<Static<this['outputSchema']> | undefined> {
    const memoryMessages = this.writeMemoryToMessages();

    // Add memory messages to step
    memoryStep.modelInputMessages = [...memoryMessages];

    try {
      const { message: chatMessage } = await this.model.chatCompletion({
        messages: toChatCompletionMessageParam(memoryMessages),
        stop: ['<end_code>', 'Observation:'],
      });

      memoryStep.modelOutputMessage = chatMessage;
      const modelOutput = chatMessage.content;
      memoryStep.modelOutput = modelOutput;

      this.logger.logMarkdown({
        content: modelOutput,
        title: '--- Output message of the LLM ---',
      });

      try {
        const scriptCode = this.parseCodeOutput(modelOutput);
        const { result, output, isFinalAnswer } = await this.executeScript(
          scriptCode,
        );
        memoryStep.actionOutput = result;
        memoryStep.modelOutput = scriptCode;

        if (output) {
          memoryStep.observations.push({
            type: 'text',
            text: `-- Script execution results --\n${truncateContent(output)}`,
          });
          this.logger.logMarkdown({
            content: output,
            title: '-- Script execution results --',
          });
        } else {
          memoryStep.observations.push({
            type: 'text',
            text: `-- Script execution results --\nNo output from script execution`,
          });
          this.logger.logMarkdown({
            content: 'No output from script execution',
            title: '-- Script execution results --',
          });
        }

        // Return output if this appears to be the final answer
        if (isFinalAnswer) {
          return result as Static<this['outputSchema']>;
        }
        return undefined;
      } catch (error: any) {
        throw new AgentError({
          message: `Error executing code: ${error.message}`,
          code: AgentErrorCode.SCRIPT_EXECUTION_FAILED,
        });
      }
    } catch (error: any) {
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError({
        message: `Error generating model output: ${error.message}`,
        code: AgentErrorCode.MODEL_OUTPUT_ERROR,
      });
    }
  }

  updateShouldRunPlanning(override?: boolean) {
    if (override) {
      this.shouldRunPlanning = override;
      return;
    }
    if (this.planningInterval && this.stepNumber % this.planningInterval == 1) {
      this.shouldRunPlanning = true;
    }
  }

  async beforeStep(): Promise<void> {
    return;
  }

  async afterStep(): Promise<void> {
    this.updateShouldRunPlanning();
  }

  async executeScript(
    script: string,
  ): Promise<{ result: unknown; output: string; isFinalAnswer: boolean }> {
    try {
      const { returnValue, calls, output } = await this.sandbox.executeScript(
        script,
      );

      const terminatingCall = calls.find(
        (result) =>
          result.callable === 'finalAnswer' || result.callable === 'terminate',
      );
      return {
        result: returnValue || terminatingCall?.returnValue,
        isFinalAnswer: terminatingCall !== undefined,
        output,
      };
    } catch (error: any) {
      throw new AgentError({
        message: `Script execution failed: ${error.message}`,
        code: AgentErrorCode.SCRIPT_EXECUTION_FAILED,
      });
    }
  }

  parseCodeOutput(content: string): string {
    const sanitizedContent = content.replace(/^\s*(let|const)\s+/gm, '');

    const pattern = /```(?:js|javascript|ts|typescript)?\s*\n?([\s\S]*?)\n?```/;
    const match = sanitizedContent.match(pattern);
    if (!match || match.length < 2) {
      return sanitizedContent;
    }
    const code = match[1]!;
    return code;
  }
}
