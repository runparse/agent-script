import { IMultiStepAgentProps, MultiStepAgent } from './multiStepAgent';
import { ActionStep } from '../agentMemory';
import { toChatCompletionMessageParam, truncateContent } from '../utils';
import { IMultiStepAgent } from '../types';
import { codeAgentPrompt } from './codeAgent.prompt.template';
import { FinalAnswerTool } from '../tools/finalAnswerTool';
import vm from 'vm';
import { Static, TSchema } from '@sinclair/typebox';
import { BufferedConsole } from '../bufferedConsole';
import { AgentError, AgentErrorCode } from '../errors';
import { PartialBy } from '../lang';

export interface ICodeAgent<TOutSchema extends TSchema>
  extends IMultiStepAgent<TOutSchema> {
  authorizedImports?: string[];
  sandbox?: vm.Context;
}

export interface ICodeAgentProps<TOutSchema extends TSchema>
  extends PartialBy<IMultiStepAgentProps<TOutSchema>, 'prompts'> {
  authorizedImports?: string[];
  sandbox?: vm.Context;
}

export class CodeAgent<TOutSchema extends TSchema>
  extends MultiStepAgent<TOutSchema>
  implements ICodeAgent<TOutSchema>
{
  authorizedImports: string[];
  sandbox: vm.Context;

  constructor(props: ICodeAgentProps<TOutSchema>) {
    const prompts = props.prompts || codeAgentPrompt;
    super({ ...props, prompts });
    this.authorizedImports = props.authorizedImports || [];
    this.tools.push(new FinalAnswerTool());
    this.sandbox = props.sandbox || vm.createContext();
  }

  /**
   * Perform one step in the ReAct framework: the agent thinks, acts, and observes the result.
   * Returns None if the step is not final.
   *
   * @param memoryStep The current memory step being processed
   * @returns The output if this is the final step, undefined otherwise
   */
  override async step(
    memoryStep: ActionStep
  ): Promise<Static<TOutSchema> | undefined> {
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
        title: 'Output message of the LLM:',
      });

      // console.log('--------------------------------');
      // console.log(this.memory.systemPrompt.systemPrompt);
      // console.log(JSON.stringify(this.memory.getFullSteps(), undefined, 2));
      // console.log('--------------------------------');

      try {
        const { result, output, isFinalAnswer } = await this.executeScript(
          this.parseCodeOutput(modelOutput)
        );
        memoryStep.actionOutput = result;

        if (output) {
          memoryStep.observations = `Execution output:\n${truncateContent(
            output
          )}`;
        }

        // Return output if this appears to be the final answer
        if (isFinalAnswer) {
          return result as Static<TOutSchema>;
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

  async executeScript(
    scriptCode: string
  ): Promise<{ result: unknown; output: string; isFinalAnswer: boolean }> {
    const scriptToolCallResults: { result: unknown; name: string }[] = [];
    const bufferedConsole = new BufferedConsole();

    this.tools.forEach((tool) => {
      this.sandbox[tool.name] = async (input: unknown) => {
        try {
          const result = await this.executeToolCall(
            tool.name,
            input as TSchema
          );
          scriptToolCallResults.push({ result, name: tool.name });
          return result;
        } catch (error: any) {
          throw new AgentError({
            message: `Error executing tool call: ${error.message}`,
            code: AgentErrorCode.TOOL_EXECUTION_ERROR,
          });
        }
      };
    });
    this.sandbox.console = bufferedConsole;

    try {
      const result = await vm.runInContext(
        `(async () => {
          ${scriptCode}
        })()`,
        this.sandbox
      );
      return {
        result:
          result ||
          scriptToolCallResults[scriptToolCallResults.length - 1]?.result,
        isFinalAnswer:
          scriptToolCallResults.find((result) => result.name === 'finalAnswer')
            ?.result !== undefined,
        output: bufferedConsole.getOutput(),
      };
    } catch (error: any) {
      throw new AgentError({
        message: `Script execution failed: ${error.message}`,
        code: AgentErrorCode.SCRIPT_EXECUTION_FAILED,
      });
    }
  }

  parseCodeOutput(content: string): string {
    const pattern = /```(?:js|javascript|ts|typescript)?\s*\n?([\s\S]*?)\n?```/;
    const match = content.match(pattern);
    if (!match || match.length < 2) {
      throw new AgentError({
        message: `Your code snippet is invalid, because the regex pattern ${pattern} was not found in it. 
Here is your code snippet:
${content}
Make sure to include code with the correct pattern, for instance:
Thoughts: Your thoughts
Code:
\`\`\`js
// Your javascript code here
\`\`\`<end_code>`,
        code: AgentErrorCode.INVALID_CODE_PATTERN,
      });
    }
    const code = match[1]!;
    return code;
  }
}
