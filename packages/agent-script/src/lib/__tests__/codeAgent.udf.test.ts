import { Type } from '@sinclair/typebox';
import { CodeAgent } from '../codeAgent';
import { FinalAnswerUdf, TerminateUdf } from '../udf';
import { AgentError, AgentErrorCode } from '../errors';
import { IUdf } from '../types';

describe('CodeAgent', () => {
  describe('UDF Execution', () => {
    test('should successfully call a UDF with valid input', async () => {
      // Create a mock UDF
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const mockUdf: IUdf = {
        name: 'mockUdf',
        description: 'Mock UDF',
        inputSchema: Type.Object({
          testParam: Type.String({ description: 'Test parameter' }),
        }),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn().mockResolvedValue('Success response'),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
      };

      // Initialize the agent
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf, mockUdf],
        maxSteps: 10,
      });

      // Call the UDF with valid input
      const result = await agent.callUdf('mockUdf', {
        testParam: 'test value',
      });

      // Verify the UDF was called with correct input
      expect(mockUdf.call).toHaveBeenCalledWith(
        { testParam: 'test value' },
        agent,
      );
      expect(result).toBe('Success response');
    });

    test('should throw error when calling non-existent UDF', async () => {
      // Create basic UDFs required for initialization
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      // Initialize the agent
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf],
        maxSteps: 10,
      });

      // Attempt to call a non-existent UDF
      await expect(agent.callUdf('nonExistentUdf', {})).rejects.toThrow(
        new AgentError({
          message: 'UDF nonExistentUdf not found',
          code: AgentErrorCode.UDF_NOT_FOUND,
        }),
      );
    });

    test('should validate UDF input schema before execution', async () => {
      // Create a mock UDF with a specific input schema
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const mockUdf: IUdf = {
        name: 'mockUdf',
        description: 'Mock UDF',
        inputSchema: Type.Object({
          requiredParam: Type.String({ description: 'Required parameter' }),
        }),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn().mockResolvedValue('Success response'),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
      };

      // Initialize the agent
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf, mockUdf],
        maxSteps: 10,
      });

      // Attempt to call the UDF with invalid input (missing required parameter)
      await expect(agent.callUdf('mockUdf', {})).rejects.toThrow(AgentError);
      expect(mockUdf.call).not.toHaveBeenCalled();

      // Call with valid input should succeed
      await agent.callUdf('mockUdf', { requiredParam: 'valid value' });
      expect(mockUdf.call).toHaveBeenCalled();
    });

    test('should call onBeforeCall and onAfterCall hooks for UDFs', async () => {
      // Create a mock UDF with lifecycle hooks
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const mockUdf: IUdf = {
        name: 'mockUdf',
        description: 'Mock UDF',
        inputSchema: Type.Object({
          testParam: Type.String({ description: 'Test parameter' }),
        }),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn().mockResolvedValue('Success response'),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
      };

      // Initialize the agent
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf, mockUdf],
        maxSteps: 10,
      });

      const input = { testParam: 'test value' };
      const output = await agent.callUdf('mockUdf', input);

      // Verify hooks were called in the correct order with the right arguments
      expect(mockUdf.onBeforeCall).toHaveBeenCalledWith(input, agent);
      expect(mockUdf.call).toHaveBeenCalledWith(input, agent);
      expect(mockUdf.onAfterCall).toHaveBeenCalledWith(input, output, agent);

      // Verify the call order
      expect(mockUdf.onBeforeCall).toHaveBeenCalled();
      expect(mockUdf.call).toHaveBeenCalled();
      expect(mockUdf.onAfterCall).toHaveBeenCalled();
    });

    test('should handle UDF execution errors gracefully', async () => {
      // Create a mock UDF that throws an error
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const mockUdf: IUdf = {
        name: 'mockUdf',
        description: 'Mock UDF that throws an error',
        inputSchema: Type.Object({
          testParam: Type.String({ description: 'Test parameter' }),
        }),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn().mockImplementation(() => {
          throw new Error('Test execution error');
        }),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
      };

      // Initialize the agent
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf, mockUdf],
        maxSteps: 10,
      });

      // Attempt to call the UDF that throws an error
      await expect(
        agent.callUdf('mockUdf', { testParam: 'test value' }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Error when calling UDF mockUdf'),
          code: AgentErrorCode.UDF_EXECUTION_ERROR,
        }),
      );

      // Verify onBeforeCall was called but onAfterCall wasn't
      expect(mockUdf.onBeforeCall).toHaveBeenCalled();
      expect(mockUdf.onAfterCall).not.toHaveBeenCalled();
    });
  });
});
