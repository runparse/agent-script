import * as vm from 'vm';
import { BufferConsole } from './bufferConsole';
import { AgentError, AgentErrorCode } from './errors';
import { ICallableResult } from './types';
import {
  truncateContent,
  MAX_LENGTH_TRUNCATE_CONTENT,
  formatBytes,
} from './utils';
import { notEmpty } from './lang';
export class Sandbox {
  constructor(
    public vmContext: vm.Context = vm.createContext(),
    public callHistory: ICallableResult[][] = [],
  ) {}

  register(
    callable: string,
    fn: (...fnArgs: any[]) => Promise<ICallableResult>,
  ) {
    this.vmContext[callable] = async (...args: any[]) => {
      const currentScriptCalls = this.callHistory[this.callHistory.length - 1]!;
      try {
        const result = await fn(...args);
        currentScriptCalls.push(result);
        return result.returnValue;
      } catch (error: any) {
        throw new Error(`Error calling function ${callable}: ${error.message}`);
      }
    };
  }

  async executeScript(
    script: string,
  ): Promise<{ calls: ICallableResult[]; returnValue: any; output: string }> {
    const sandboxConsole = new BufferConsole();
    this.vmContext.console = sandboxConsole;
    function trap(reason: any) {
      if (reason instanceof Error) {
        sandboxConsole.log(`UnhandledPromiseRejection: ${reason.message}`);
      } else {
        sandboxConsole.log(`UnhandledPromiseRejection: ${reason}`);
      }
    }
    process.on('unhandledRejection', trap);

    const currentScriptCalls: ICallableResult[] = [];
    this.callHistory.push(currentScriptCalls);

    try {
      const existingVariables = new Set(Object.keys(this.vmContext));

      const scriptReturnValue = await vm.runInContext(
        `(async () => {
          ${script}
        })()`,
        this.vmContext,
      );

      const newVariables = Array.from(Object.keys(this.vmContext)).filter(
        (key) => !existingVariables.has(key),
      );

      const callResultsString = this.formatScriptCallResults(
        newVariables,
        currentScriptCalls,
      );
      if (callResultsString) {
        sandboxConsole.log(callResultsString);
      }

      return {
        calls: currentScriptCalls,
        returnValue: scriptReturnValue,
        output: sandboxConsole.getOutput(),
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

  formatScriptCallResults(
    variables: string[],
    callResults: ICallableResult[],
    options: {
      indented: boolean;
      callResultMaxLength: number;
    } = {
      indented: true,
      callResultMaxLength: MAX_LENGTH_TRUNCATE_CONTENT,
    },
  ): string {
    return callResults
      .map((call) => {
        const correspondingVariable = variables.find(
          (variable) => this.vmContext[variable] === call.returnValue,
        );

        if (call.returnValueSummary) {
          return `// ${call.callable} ->\n\n${call.returnValueSummary}`;
        }

        let formattedReturnValue = options.indented
          ? JSON.stringify(call.returnValue, null, 2)
          : JSON.stringify(call.returnValue);

        const truncated =
          formattedReturnValue.length > options.callResultMaxLength;

        if (truncated) {
          formattedReturnValue = truncateContent(
            formattedReturnValue,
            options.callResultMaxLength,
          );
        }

        return `// ${call.callable} -> ${
          truncated
            ? `(Truncated. Full size is ${formatBytes(
                formattedReturnValue.length,
              )})`
            : ''
        }\n${
          correspondingVariable ? `${correspondingVariable} = ` : ''
        }${formattedReturnValue}`;
      })
      .filter(notEmpty)
      .join('\n\n');
  }
}
