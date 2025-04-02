import { Type } from '@sinclair/typebox';
import { CodeAgent } from '../codeAgent';
import { FinalAnswerUdf, TerminateUdf } from '../udf';
import { AgentError, AgentErrorCode } from '../errors';
import { ChatModel } from '../chatModel';
import { Sandbox } from '../sandbox';
import { IUdf } from '../types';

// Mock console.warn to capture warnings
const originalConsoleWarn = console.warn;
let consoleWarnOutput: string[] = [];

describe('CodeAgent', () => {
  beforeEach(() => {
    // Clear array before each test
    consoleWarnOutput = [];
    console.warn = jest.fn((message: string) => {
      consoleWarnOutput.push(message);
    });
  });

  afterEach(() => {
    // Restore original console.warn
    console.warn = originalConsoleWarn;
    jest.clearAllMocks();
  });

  describe('Constructor & Initialization', () => {
    test('should initialize with default values when optional props are not provided', () => {
      // Create basic UDFs required for initialization
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf],
        maxSteps: 10,
      });

      // Verify default values are set correctly
      expect(agent.name).toBe('TestAgent');
      expect(agent.description).toBe('Test agent description');
      expect(agent.udfs).toContain(finalAnswerUdf);
      expect(agent.udfs).toContain(terminateUdf);
      expect(agent.maxSteps).toBe(10);
      expect(agent.authorizedImports).toEqual([]);
      expect(agent.sandbox).toBeInstanceOf(Sandbox);
      expect(agent.model).toBeInstanceOf(ChatModel);
      expect(agent.managedAgents).toEqual([]);
    });

    test('should throw error when required UDFs (finalAnswer and terminate) are missing', () => {
      // Create a mock UDF that is neither finalAnswer nor terminate
      const mockUdf: IUdf = {
        name: 'mockUdf',
        description: 'Mock UDF',
        inputSchema: Type.Object({}),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn(),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
        getCallResultSummary: jest.fn(),
      };

      // Expect the constructor to throw an error
      expect(() => {
        new CodeAgent({
          name: 'TestAgent',
          description: 'Test agent description',
          udfs: [mockUdf],
          maxSteps: 10,
        });
      }).toThrow(
        new AgentError({
          message:
            'The CodeAgent requires at least one stopping UDF (BaseStoppingUdf) to be present in the udfs list.',
          code: AgentErrorCode.UDF_NOT_FOUND,
        }),
      );
    });

    test('should validate UDF input schemas and warn about missing descriptions', () => {
      // Create UDFs with primitive types that lack descriptions
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const udfWithPrimitiveNoDesc: IUdf = {
        name: 'testUdf',
        description: 'Test UDF',
        inputSchema: Type.Object({
          primitiveField: Type.String(), // Missing description
          numberField: Type.Number(), // Missing description
        }),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn(),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
        getCallResultSummary: jest.fn(),
      };

      // Initialize the agent
      new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf, udfWithPrimitiveNoDesc],
        maxSteps: 10,
      });

      // Verify warnings were logged
      expect(consoleWarnOutput.length).toBeGreaterThan(0);
      expect(consoleWarnOutput[0]).toContain('UDF testUdf has an input schema');
      expect(consoleWarnOutput[0]).toContain(
        'that is a primitive type but has no description',
      );
    });

    test('should throw error when UDF names are not unique', () => {
      // Create UDFs with duplicate names
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const duplicateUdf1: IUdf = {
        name: 'duplicateUdf',
        description: 'Duplicate UDF 1',
        inputSchema: Type.Object({}),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn(),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
        getCallResultSummary: jest.fn(),
      };

      const duplicateUdf2: IUdf = {
        name: 'duplicateUdf', // Same name as duplicateUdf1
        description: 'Duplicate UDF 2',
        inputSchema: Type.Object({}),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn(),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
        getCallResultSummary: jest.fn(),
      };

      // Expect the constructor to throw an error
      expect(() => {
        new CodeAgent({
          name: 'TestAgent',
          description: 'Test agent description',
          udfs: [finalAnswerUdf, terminateUdf, duplicateUdf1, duplicateUdf2],
          maxSteps: 10,
        });
      }).toThrow(
        new AgentError({
          message: 'UDF names must be unique.',
          code: AgentErrorCode.VALIDATION_ERROR,
        }),
      );
    });

    test('should register all UDFs in the sandbox during initialization', () => {
      // Create mock UDFs
      const finalAnswerUdf = new FinalAnswerUdf();
      const terminateUdf = new TerminateUdf();

      const customUdf: IUdf = {
        name: 'customUdf',
        description: 'Custom UDF',
        inputSchema: Type.Object({
          param: Type.String({ description: 'Parameter description' }),
        }),
        outputSchema: Type.String(),
        getSignature: jest.fn(),
        call: jest.fn(),
        onBeforeCall: jest.fn(),
        onAfterCall: jest.fn(),
        getCallResultSummary: jest.fn(),
      };

      // Create a spy on Sandbox.register
      const mockSandbox = new Sandbox();
      const registerSpy = jest.spyOn(mockSandbox, 'register');

      // Initialize the agent with mocked sandbox
      new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf, customUdf],
        maxSteps: 10,
        sandbox: mockSandbox,
      });

      // Verify all UDFs were registered in sandbox
      expect(registerSpy).toHaveBeenCalledTimes(3);
      expect(registerSpy).toHaveBeenCalledWith(
        'finalAnswer',
        expect.any(Function),
      );
      expect(registerSpy).toHaveBeenCalledWith(
        'terminate',
        expect.any(Function),
      );
      expect(registerSpy).toHaveBeenCalledWith(
        'customUdf',
        expect.any(Function),
      );
    });
  });

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
        getCallResultSummary: jest.fn().mockResolvedValue(null),
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
      expect(result).toEqual({
        returnValue: 'Success response',
        returnValueSummary: null,
        callable: 'mockUdf',
      });
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
        getCallResultSummary: jest.fn(),
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
        getCallResultSummary: jest.fn().mockResolvedValue(null),
      };

      // Initialize the agent
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent description',
        udfs: [finalAnswerUdf, terminateUdf, mockUdf],
        maxSteps: 10,
      });

      const input = { testParam: 'test value' };
      const callResult = await agent.callUdf('mockUdf', input);

      // Verify hooks were called in the correct order with the right arguments
      expect(mockUdf.onBeforeCall).toHaveBeenCalledWith(input, agent);
      expect(mockUdf.call).toHaveBeenCalledWith(input, agent);
      expect(mockUdf.onAfterCall).toHaveBeenCalledWith(
        input,
        callResult.returnValue,
        agent,
      );

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
        getCallResultSummary: jest.fn(),
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
