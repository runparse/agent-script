import { Sandbox } from '../sandbox';
import { AgentError, AgentErrorCode } from '../errors';

describe('Sandbox', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  describe('register', () => {
    it('should register a callable function in the vmContext', async () => {
      const testFn = async () => ({
        returnValue: 'test result',
        returnValueSummary: null,
        callable: 'testFunction',
      });
      sandbox.register('testFunction', testFn);

      const result = await sandbox.executeScript('await testFunction()');
      expect(result.returnValue).toBe(undefined);

      const result2 = await sandbox.executeScript(
        'return await testFunction()',
      );
      expect(result2.returnValue).toEqual('test result');
    });

    it('should track function calls in callHistory', async () => {
      const testFn = async () => ({
        returnValue: 'test result',
        returnValueSummary: 'test result summary',
        callable: 'testFunction',
      });
      sandbox.register('testFunction', testFn);
      const testFn2 = async () => ({
        returnValue: 'test result 2',
        returnValueSummary: 'test result 2 summary',
        callable: 'testFunction2',
      });
      sandbox.register('testFunction2', testFn2);

      await sandbox.executeScript(
        'await testFunction(); await testFunction2();',
      );
      expect(sandbox.callHistory[0]).toHaveLength(2);
      expect(sandbox.callHistory[0]?.[0]).toEqual({
        returnValue: 'test result',
        returnValueSummary: 'test result summary',
        callable: 'testFunction',
      });
      expect(sandbox.callHistory[0]?.[1]).toEqual({
        returnValue: 'test result 2',
        returnValueSummary: 'test result 2 summary',
        callable: 'testFunction2',
      });

      await sandbox.executeScript('await testFunction()');
      expect(sandbox.callHistory[0]).toHaveLength(2);
      expect(sandbox.callHistory[1]).toHaveLength(1);
      expect(sandbox.callHistory[1]?.[0]).toEqual({
        returnValue: 'test result',
        returnValueSummary: 'test result summary',
        callable: 'testFunction',
      });
    });

    it('should handle errors in registered functions', async () => {
      const errorFn = async () => {
        throw new Error('Test error');
      };
      sandbox.register('errorFunction', errorFn);

      await expect(
        sandbox.executeScript('await errorFunction()'),
      ).rejects.toThrow(
        'Script execution failed: Error calling function errorFunction: Test error',
      );
    });

    it('should properly pass arguments to registered functions', async () => {
      const argFn = async ({ a, b }: { a: number; b: string }) => ({
        returnValue: `${a}-${b}`,
        returnValueSummary: null,
        callable: 'argFunction',
      });
      sandbox.register('argFunction', argFn);

      const result = await sandbox.executeScript(
        'return await argFunction({ a: 42, b: "test" })',
      );
      expect(result.returnValue).toEqual('42-test');
    });
  });

  describe('executeScript', () => {
    it('should execute a simple script and return the expected result', async () => {
      const result = await sandbox.executeScript('return 42;');
      expect(result.returnValue).toBe(42);
    });

    it('should capture console output in the returned output string', async () => {
      const result = await sandbox.executeScript('console.log("test output")');
      expect(result.output).toContain('test output');
    });

    it('should track all function calls made during execution', async () => {
      const testFn = async () => ({
        returnValue: 'result',
        returnValueSummary: null,
        callable: 'testFn',
      });
      sandbox.register('testFn', testFn);

      const result = await sandbox.executeScript(`
        await testFn();
        await testFn();
      `);

      expect(result.calls).toHaveLength(2);
      expect(result.calls[0]).toEqual({
        returnValue: 'result',
        returnValueSummary: null,
        callable: 'testFn',
      });
      expect(result.calls[1]).toEqual({
        returnValue: 'result',
        returnValueSummary: null,
        callable: 'testFn',
      });
    });

    it('should throw AgentError when script execution fails', async () => {
      await expect(sandbox.executeScript('invalid code;')).rejects.toThrow(
        new AgentError({
          message: "Script execution failed: Unexpected identifier 'code'",
          code: AgentErrorCode.SCRIPT_EXECUTION_FAILED,
        }),
      );
    });

    it('should not track newly created variables if not associated with a UDF call', async () => {
      const result = await sandbox.executeScript(`
        const newVar = 'test value';
        return newVar;
      `);

      expect(result.returnValue).toBe('test value');
      expect(result.output).toBe('');
    });

    it('should track newly created variables if associated with a UDF call', async () => {
      const testFn = async () => ({
        returnValue: 'result',
        returnValueSummary: null,
        callable: 'testFn',
      });
      sandbox.register('testFn', testFn);

      const result = await sandbox.executeScript(`
        testFnResult = await testFn();
      `);

      expect(result.returnValue).toBe(undefined);
      expect(result.output).toContain('testFnResult = "result"');
    });
  });

  describe('formatScriptCallResults', () => {
    it('should format call results with corresponding variables', () => {
      const testCallReturnValue = { key: 'value' };
      sandbox.vmContext['testVar'] = testCallReturnValue;

      const formatted = sandbox.formatScriptCallResults(
        ['testVar'],
        [
          {
            callable: 'testFn',
            returnValue: testCallReturnValue,
            returnValueSummary: null,
          },
        ],
      );

      expect(formatted).toContain('testVar =');
      expect(formatted).toContain(JSON.stringify(testCallReturnValue, null, 2));
    });

    it('should format call results without variables', () => {
      const formatted = sandbox.formatScriptCallResults(
        [],
        [
          {
            callable: 'testFn',
            returnValue: 'result',
            returnValueSummary: null,
          },
        ],
      );

      expect(formatted).not.toContain('=');
      expect(formatted).toContain('"result"');
    });

    it('should handle multiple call results', () => {
      const calls = [
        {
          callable: 'fn1',
          returnValue: 'result1',
          returnValueSummary: null,
        },
        {
          callable: 'fn2',
          returnValue: 'result2',
          returnValueSummary: null,
        },
      ];

      const formatted = sandbox.formatScriptCallResults([], calls);

      expect(formatted).toContain('fn1');
      expect(formatted).toContain('fn2');
      expect(formatted).toContain('"result1"');
      expect(formatted).toContain('"result2"');
    });

    it('should properly stringify complex return values', () => {
      const complexValue = {
        nested: {
          array: [1, 2, 3],
          string: 'test',
        },
      };

      const formatted = sandbox.formatScriptCallResults(
        [],
        [
          {
            callable: 'testFn',
            returnValue: complexValue,
            returnValueSummary: null,
          },
        ],
      );

      expect(formatted).toContain(JSON.stringify(complexValue, null, 2));
    });

    it('should truncate long return values', () => {
      const longString = 'a'.repeat(2048);

      const formatted = sandbox.formatScriptCallResults(
        [],
        [
          {
            callable: 'testFn',
            returnValue: longString,
            returnValueSummary: null,
          },
        ],
        { indented: true, callResultMaxLength: 2047 },
      );

      expect(formatted).toContain('(Truncated. Full size is 2.06 KB)');
      expect(formatted).toContain(
        '-- Content has been truncated to be below 2047 characters --',
      );
    });

    it('should not truncate content under the max length', () => {
      const shortString = 'short result';

      const formatted = sandbox.formatScriptCallResults(
        [],
        [
          {
            callable: 'testFn',
            returnValue: shortString,
            returnValueSummary: null,
          },
        ],
        { indented: true, callResultMaxLength: 100 },
      );

      expect(formatted).not.toContain('Truncated');
      expect(formatted).toContain('"short result"');
    });

    it('should respect the indented option when formatting', () => {
      const testObject = { a: 1, b: { c: 2 } };

      const indentedFormatted = sandbox.formatScriptCallResults(
        [],
        [
          {
            callable: 'testFn',
            returnValue: testObject,
            returnValueSummary: null,
          },
        ],
        { indented: true, callResultMaxLength: 100 },
      );

      const nonIndentedFormatted = sandbox.formatScriptCallResults(
        [],
        [
          {
            callable: 'testFn',
            returnValue: testObject,
            returnValueSummary: null,
          },
        ],
        { indented: false, callResultMaxLength: 100 },
      );

      expect(nonIndentedFormatted).toContain('{"a":1,"b":{"c":2}}');
      expect(indentedFormatted).toContain(`{
  "a": 1,
  "b": {
    "c": 2
  }
}`);
      expect(indentedFormatted.length).toBeGreaterThan(
        nonIndentedFormatted.length,
      );
    });
  });
});
