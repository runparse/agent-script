import { Sandbox } from '../sandbox';
import { AgentError, AgentErrorCode } from '../errors';

describe('Sandbox', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = new Sandbox();
  });

  describe('register', () => {
    it('should register a callable function in the vmContext', async () => {
      const testFn = async () => 'test result';
      sandbox.register('testFunction', testFn);

      const result = await sandbox.executeScript('await testFunction()');
      expect(result.returnValue).toBe(undefined);

      const result2 = await sandbox.executeScript(
        'return await testFunction()',
      );
      expect(result2.returnValue).toBe('test result');
    });

    it('should track function calls in callHistory', async () => {
      const testFn = async () => 'test result';
      sandbox.register('testFunction', testFn);
      const testFn2 = async () => 'test result 2';
      sandbox.register('testFunction2', testFn2);

      await sandbox.executeScript(
        'await testFunction(); await testFunction2();',
      );
      expect(sandbox.callHistory[0]).toHaveLength(2);
      expect(sandbox.callHistory[0]?.[0]).toEqual({
        returnValue: 'test result',
        callable: 'testFunction',
      });
      expect(sandbox.callHistory[0]?.[1]).toEqual({
        returnValue: 'test result 2',
        callable: 'testFunction2',
      });

      await sandbox.executeScript('await testFunction()');
      expect(sandbox.callHistory[0]).toHaveLength(2);
      expect(sandbox.callHistory[1]).toHaveLength(1);
      expect(sandbox.callHistory[1]?.[0]).toEqual({
        returnValue: 'test result',
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
      const argFn = async ({ a, b }: { a: number; b: string }) => `${a}-${b}`;
      sandbox.register('argFunction', argFn);

      const result = await sandbox.executeScript(
        'return await argFunction({ a: 42, b: "test" })',
      );
      expect(result.returnValue).toBe('42-test');
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
      const testFn = async () => 'result';
      sandbox.register('testFn', testFn);

      const result = await sandbox.executeScript(`
        await testFn();
        await testFn();
      `);

      expect(result.calls).toHaveLength(2);
      expect(result.calls[0]).toEqual({
        returnValue: 'result',
        callable: 'testFn',
      });
      expect(result.calls[1]).toEqual({
        returnValue: 'result',
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
      const testFn = async () => 'result';
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
      const testValue = { key: 'value' };
      sandbox.vmContext['testVar'] = testValue;

      const formatted = sandbox.formatScriptCallResults(
        ['testVar'],
        [{ callable: 'testFn', returnValue: testValue }],
      );

      expect(formatted).toContain('testVar =');
      expect(formatted).toContain(JSON.stringify(testValue, null, 2));
    });

    it('should format call results without variables', () => {
      const formatted = sandbox.formatScriptCallResults(
        [],
        [{ callable: 'testFn', returnValue: 'result' }],
      );

      expect(formatted).not.toContain('=');
      expect(formatted).toContain('"result"');
    });

    it('should handle multiple call results', () => {
      const calls = [
        { callable: 'fn1', returnValue: 'result1' },
        { callable: 'fn2', returnValue: 'result2' },
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
        [{ callable: 'testFn', returnValue: complexValue }],
      );

      expect(formatted).toContain(JSON.stringify(complexValue, null, 2));
    });
  });
});
