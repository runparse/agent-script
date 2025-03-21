import { Static, TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import nunjucks from 'nunjucks';
import vm from 'vm';
import { AgentLogger } from './agentLogger';
import {
  ActionStep,
  AgentMemory,
  PlanningStep,
  SystemPromptStep,
  TaskStep,
} from './agentMemory';
import { BufferedConsole } from './bufferedConsole';
import { ChatModel } from './chatModel';
import { AgentError, AgentErrorCode } from './errors';
import {
  IAgent,
  IAgentLogger,
  IAgentPrompt,
  IChatMessage,
  IChatModel,
  ICodeAgent,
  IUdf,
  LogLevel,
} from './types';
import {
  toChatCompletionMessageParam,
  truncateContent,
  walkTypeboxSchema,
} from './utils';
import { codeAgentPrompt } from './codeAgent.prompt';
import { CallAgentUdf } from './udf/callAgentUdf';
import { FinalAnswerUdf } from './udf/finalAnswerUdf';
import { TerminateUdf } from './udf/terminateUdf';

export interface ICodeAgentProps {
  task: string;
  name: string;
  description: string;
  udfs: IUdf[];
  authorizedImports?: string[];
  sandboxContext?: vm.Context;
  prompts?: IAgentPrompt;
  maxSteps: number;
  maxMemoryTokenCount?: number;
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
  sandboxContext: vm.Context;
  model: IChatModel;
  prompts: IAgentPrompt;
  memory: AgentMemory;
  outputSchema: TSchema;
  maxSteps: number;
  maxMemoryTokenCount: number;
  managedAgents: IAgent[];
  stepNumber: number;
  planningInterval?: number;
  logger: IAgentLogger;

  private shouldRunPlanning: boolean;

  constructor(props: ICodeAgentProps) {
    this.task = props.task;
    this.name = props.name;
    this.description = props.description;
    this.udfs = props.udfs;
    if (
      !this.udfs.some(
        (udf) => udf instanceof FinalAnswerUdf || udf instanceof TerminateUdf,
      )
    ) {
      throw new AgentError({
        message:
          'The CodeAgent requires the finalAnswer and terminate UDFs to be present in the udfs array.',
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
    this.sandboxContext = props.sandboxContext || vm.createContext();
    this.prompts = props.prompts || codeAgentPrompt;
    this.maxSteps = props.maxSteps;
    this.maxMemoryTokenCount = props.maxMemoryTokenCount || 128 * 1000;
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

  validate() {
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
   * Execute UDF with the provided input and returns the result.
   * This method replaces arguments with the actual values from the state if they refer to state variables.
   *
   * @param udfName Name of the UDF to execute (should be one from this.udfs)
   * @param arguments Arguments passed to the UDF
   * @returns Result from executing the UDF
   */
  async callUdf(udfName: string, input: TSchema): Promise<Static<TSchema>> {
    const udf = this.udfs.find((t) => t.name === udfName) as IUdf;

    if (!udf) {
      throw new AgentError({
        message: `UDF ${udfName} not found`,
        code: AgentErrorCode.UDF_NOT_FOUND,
      });
    }

    try {
      // Validate input against schema
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
  ): Promise<Static<this['outputSchema']>> {
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

    this.memory.steps.push(
      new TaskStep({ task: this.task, taskImages: images }),
    );

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
        observationsImages: images,
      });
      this.memory.steps.push(memoryStep);

      try {
        this.logger.logRule(`Step ${this.stepNumber}`, LogLevel.INFO);
        // Run one step
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

  errorCircuitBreaker(): boolean {
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
      // Generate model output
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
          memoryStep.observations = `-- UDF call results --\n${truncateContent(
            output,
          )}`;
          this.logger.logMarkdown({
            content: output,
            title: '-- UDF call results --',
          });
        } else {
          memoryStep.observations = `-- UDF call results --\nNo output from UDF calls`;
          this.logger.logMarkdown({
            content: 'No output from UDF calls',
            title: '-- UDF call results --',
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
    scriptCode: string,
  ): Promise<{ result: unknown; output: string; isFinalAnswer: boolean }> {
    function trap(reason: any) {
      if (reason instanceof Error) {
        bufferedConsole.log(`UnhandledPromiseRejection: ${reason.message}`);
      } else {
        bufferedConsole.log(`UnhandledPromiseRejection: ${reason}`);
      }
    }
    process.on('unhandledRejection', trap);

    const scriptUdfCalls: {
      returnValue: unknown;
      udfName: string;
    }[] = [];
    const bufferedConsole = new BufferedConsole();

    this.udfs.forEach((udf) => {
      this.sandboxContext[udf.name] = async (input: unknown) => {
        try {
          const result = await this.callUdf(udf.name, input as TSchema);
          scriptUdfCalls.push({
            returnValue: result,
            udfName: udf.name,
          });
          return result;
        } catch (error: any) {
          throw new AgentError({
            message: `Error calling UDF ${udf.name}: ${error.message}`,
            code: AgentErrorCode.UDF_EXECUTION_ERROR,
          });
        }
      };
    });
    this.sandboxContext.console = bufferedConsole;

    try {
      const sandboxExistingKeys = new Set(Object.keys(this.sandboxContext));
      const result = await vm.runInContext(
        `(async () => {
          ${scriptCode}
        })()`,
        this.sandboxContext,
      );
      const sandboxNewKeys = Array.from(
        Object.keys(this.sandboxContext),
      ).filter((key) => !sandboxExistingKeys.has(key));
      if (sandboxNewKeys.length > 0) {
        bufferedConsole.log(
          this.formatUdfCallResults(sandboxNewKeys, scriptUdfCalls),
        );
      }

      if (
        scriptUdfCalls.find((result) => result.udfName === 'terminate') &&
        scriptUdfCalls.length > 1
      ) {
        throw new AgentError({
          message: 'Termate UDF must be called in its own step.',
          code: AgentErrorCode.PREMATURE_TERMINATE,
        });
      }

      return {
        result:
          result || scriptUdfCalls[scriptUdfCalls.length - 1]?.returnValue,
        isFinalAnswer:
          scriptUdfCalls.find(
            (result) =>
              result.udfName === 'finalAnswer' ||
              result.udfName === 'terminate',
          )?.returnValue !== undefined,
        output: bufferedConsole.getOutput(),
      };
    } catch (error: any) {
      throw new AgentError({
        message: `Script execution failed: ${error.message}`,
        code: AgentErrorCode.SCRIPT_EXECUTION_FAILED,
      });
    } finally {
      setTimeout(() => process.off('unhandledRejection', trap), 100);
    }
  }

  formatUdfCallResults(
    variables: string[],
    scriptUdfCalls: {
      returnValue: unknown;
      udfName: string;
    }[],
  ): string {
    return scriptUdfCalls
      .map((udfCall) => {
        const correspondingVariable = variables.find(
          (variable) => this.sandboxContext[variable] === udfCall.returnValue,
        );
        return `// UDF: ${udfCall.udfName}\n${
          correspondingVariable ? `${correspondingVariable}:` : ''
        }${JSON.stringify(udfCall.returnValue, null, 2)}`;
      })
      .join('\n\n');
  }

  parseCodeOutput(content: string): string {
    const sanitizedContent = content.replace(/^\s*(let|const)\s+/gm, '');

    const pattern = /```(?:js|javascript|ts|typescript)?\s*\n?([\s\S]*?)\n?```/;
    const match = sanitizedContent.match(pattern);
    if (!match || match.length < 2) {
      return sanitizedContent;
      //       throw new AgentError({
      //         message: `Your code snippet is invalid, because the regex pattern ${pattern} was not found in it.
      // Here is your code snippet:
      // ${sanitizedContent}
      // Make sure to include code with the correct pattern, for instance:
      // Thoughts: Your thoughts
      // Code:
      // \`\`\`js
      // // Your javascript code here
      // \`\`\`<end_code>`,
      //         code: AgentErrorCode.INVALID_CODE_PATTERN,
      //       });
    }
    const code = match[1]!;
    return code;
  }
}
