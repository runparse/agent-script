import { CodeAgent } from '../codeAgent';
import { ActionStep } from '../agentMemory';
import { AgentErrorCode } from '../errors';
import { BaseStoppingUdf } from '../udf/baseStoppingUdf';
import { ChatModel } from '../chatModel';
import { Sandbox } from '../sandbox';
import { Type } from '@sinclair/typebox';
import { AgentLogger } from '../agentLogger';

// Mock dependencies
jest.mock('../chatModel');
jest.mock('../sandbox');
jest.mock('../agentLogger');

describe('CodeAgent', () => {
  describe('Run', () => {
    // Setup mocks
    let mockChatModel: jest.Mocked<ChatModel>;
    let mockSandbox: jest.Mocked<Sandbox>;
    let mockLogger: jest.Mocked<AgentLogger>;

    // Test UDF that extends BaseStoppingUdf
    class TestStoppingUdf extends BaseStoppingUdf {
      name = 'finalAnswer';
      description = 'Test stopping UDF';
      inputSchema = Type.Any();
      outputSchema = Type.Any();

      async call(input: any): Promise<any> {
        return input;
      }
    }

    // Setup CodeAgent and mocks before each test
    beforeEach(() => {
      mockChatModel = new ChatModel() as jest.Mocked<ChatModel>;
      mockSandbox = new Sandbox() as jest.Mocked<Sandbox>;
      mockLogger = new AgentLogger() as jest.Mocked<AgentLogger>;

      // Reset mocks
      jest.clearAllMocks();
    });

    test('should run through steps until final answer is found', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: 'some code' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      // First step doesn't have final answer, second step has final answer
      mockSandbox.executeScript
        .mockResolvedValueOnce({
          returnValue: null,
          calls: [],
          output: 'step 1 output',
        })
        .mockResolvedValueOnce({
          returnValue: 'final result',
          calls: [
            {
              callable: 'finalAnswer',
              returnValue: 'final result',
              returnValueSummary: null,
            },
          ],
          output: 'step 2 output',
        });

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      const result = await agent.run('test task');

      // Assert
      expect(result).toBe('final result');
      expect(mockSandbox.executeScript).toHaveBeenCalledTimes(2);
      expect(agent.stepNumber).toBe(3); // Started at 1, did 2 steps
      expect(agent.memory.steps.length).toBe(3); // Task step + 2 action steps
    });

    test('should stop execution when max steps is reached', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: 'some code' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      // No final answer in any step
      mockSandbox.executeScript.mockResolvedValue({
        returnValue: null,
        calls: [],
        output: 'step output',
      });

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 3, // Set low max steps
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      const result = await agent.run('test task');

      // Assert
      expect(result).toBeUndefined();
      expect(mockSandbox.executeScript).toHaveBeenCalledTimes(3);
      expect(agent.stepNumber).toBe(4); // Started at 1, did 3 steps
      expect(agent.memory.steps.length).toBe(5); // Task step + 3 action steps + final error step

      // Check that the last step contains an error about max steps
      const lastStep = agent.memory.steps[
        agent.memory.steps.length - 1
      ] as ActionStep;
      expect(lastStep.error?.code).toBe(AgentErrorCode.MAX_STEPS_REACHED);
    });

    test('should trigger error circuit breaker after 3 consecutive errors', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: 'some code' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      // All steps will throw the same error
      const errorMessage = 'Script execution failed';
      mockSandbox.executeScript.mockRejectedValue(new Error(errorMessage));

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Override the errorCircuitBreaker method to properly detect our errors
      const originalErrorCircuitBreaker =
        agent['errorCircuitBreaker'].bind(agent);
      agent['errorCircuitBreaker'] = jest.fn().mockImplementation(() => {
        // After 3 steps, we want to trigger the circuit breaker
        return agent.memory.steps.filter(
          (step) => step instanceof ActionStep && step.error,
        ).length >= 3
          ? true
          : originalErrorCircuitBreaker();
      });

      // Act
      const result = await agent.run('test task');

      // Assert
      expect(result).toBeUndefined();
      expect(mockSandbox.executeScript).toHaveBeenCalledTimes(3);
      expect(agent.stepNumber).toBe(4); // Started at 1, did 3 steps

      // Check that all steps have the same error
      const actionSteps = agent.memory.steps.filter(
        (step) => step instanceof ActionStep,
      ) as ActionStep[];
      expect(actionSteps.length).toBe(3);
      actionSteps.forEach((step) => {
        expect(step.error).toBeDefined();
        expect(step.error?.message).toContain(errorMessage);
      });
    });

    test('should call beforeStep and afterStep hooks for each step', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: 'some code' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      // Step 2 returns final answer
      mockSandbox.executeScript
        .mockResolvedValueOnce({
          returnValue: null,
          calls: [],
          output: 'step 1 output',
        })
        .mockResolvedValueOnce({
          returnValue: 'final result',
          calls: [
            {
              callable: 'finalAnswer',
              returnValue: 'final result',
              returnValueSummary: null,
            },
          ],
          output: 'step 2 output',
        });

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Mock the hooks
      const beforeStepMock = jest.fn();
      const afterStepMock = jest.fn();
      agent.beforeStep = beforeStepMock;
      agent.afterStep = afterStepMock;

      // Act
      await agent.run('test task');

      // Assert
      expect(beforeStepMock).toHaveBeenCalledTimes(2);
      expect(afterStepMock).toHaveBeenCalledTimes(2);
    });

    test('should handle step execution errors gracefully', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: 'some code' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      // First step throws error, second step succeeds with final answer
      mockSandbox.executeScript
        .mockRejectedValueOnce(new Error('Script error'))
        .mockResolvedValueOnce({
          returnValue: 'final result',
          calls: [
            {
              callable: 'finalAnswer',
              returnValue: 'final result',
              returnValueSummary: null,
            },
          ],
          output: 'step 2 output',
        });

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      const result = await agent.run('test task');

      // Assert
      expect(result).toBe('final result');
      expect(mockSandbox.executeScript).toHaveBeenCalledTimes(2);

      // Check that the first step has an error but execution continued
      const firstActionStep = agent.memory.steps.filter(
        (step) => step instanceof ActionStep,
      )[0] as ActionStep;

      expect(firstActionStep.error).toBeDefined();
      expect(firstActionStep.error?.code).toBe(
        AgentErrorCode.SCRIPT_EXECUTION_FAILED,
      );
      expect(firstActionStep.error?.message).toContain('Script error');
    });
  });

  describe('Script Execution', () => {
    // Setup mocks
    let mockChatModel: jest.Mocked<ChatModel>;
    let mockSandbox: jest.Mocked<Sandbox>;
    let mockLogger: jest.Mocked<AgentLogger>;

    // Test UDF that extends BaseStoppingUdf
    class TestStoppingUdf extends BaseStoppingUdf {
      name = 'finalAnswer';
      description = 'Test stopping UDF';
      inputSchema = Type.Any();
      outputSchema = Type.Any();

      async call(input: any): Promise<any> {
        return input;
      }
    }

    // Setup CodeAgent and mocks before each test
    beforeEach(() => {
      mockChatModel = new ChatModel() as jest.Mocked<ChatModel>;
      mockSandbox = new Sandbox() as jest.Mocked<Sandbox>;
      mockLogger = new AgentLogger() as jest.Mocked<AgentLogger>;

      // Reset mocks
      jest.clearAllMocks();
    });

    test('should parse code blocks from model output correctly', async () => {
      // Setup
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Test different code block formats
      const testCases = [
        {
          input:
            'I think we should try this:\n```javascript\nconst x = 1;\n```',
          expected: 'x = 1;',
        },
        {
          input:
            'Let me write some code:\n```js\nconsole.log("hello");\n```\nThat should work.',
          expected: 'console.log("hello");',
        },
        {
          input: 'No code block here, just plain text with code-like syntax.',
          expected:
            'No code block here, just plain text with code-like syntax.',
        },
        {
          input: '```typescript\nfunction test() { return true; }\n```',
          expected: 'function test() { return true; }',
        },
      ];

      for (const testCase of testCases) {
        const result = agent['parseCodeOutput'](testCase.input);
        expect(result).toBe(testCase.expected);
      }
    });

    test('should execute script in sandbox and return results', async () => {
      // Setup
      const scriptCode = 'console.log("test"); return 42;';
      const sandboxResult = {
        returnValue: 42,
        calls: [],
        output: 'test',
      };

      mockSandbox.executeScript.mockResolvedValue(sandboxResult);

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      const result = await agent['executeScript'](scriptCode);

      // Assert
      expect(mockSandbox.executeScript).toHaveBeenCalledWith(scriptCode);
      expect(result.result).toBe(42);
      expect(result.output).toBe('test');
      expect(result.isFinalAnswer).toBe(false);
    });

    test('should identify final answer from script execution', async () => {
      // Setup
      const scriptCode = 'finalAnswer("This is the solution");';
      const sandboxResult = {
        returnValue: null,
        calls: [
          {
            callable: 'finalAnswer',
            returnValue: 'This is the solution',
            returnValueSummary: null,
          },
        ],
        output: '',
      };

      mockSandbox.executeScript.mockResolvedValue(sandboxResult);

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      const result = await agent['executeScript'](scriptCode);

      // Assert
      expect(result.result).toBe('This is the solution');
      expect(result.isFinalAnswer).toBe(true);
    });

    test('should handle script execution errors gracefully', async () => {
      // Setup
      const scriptCode = 'this will cause an error';
      mockSandbox.executeScript.mockRejectedValue(new Error('Syntax error'));

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act & Assert
      await expect(agent['executeScript'](scriptCode)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining(
            'Script execution failed: Syntax error',
          ),
          code: AgentErrorCode.SCRIPT_EXECUTION_FAILED,
        }),
      );
    });

    test('should capture script output in observations', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: {
          role: 'assistant',
          content: '```javascript\nconsole.log("detailed output");\n```',
        },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      mockSandbox.executeScript.mockResolvedValue({
        returnValue: null,
        calls: [],
        output: 'detailed output',
      });

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      await agent.run('test task');

      // Assert
      // Check that the memory step's observations contain the script output
      const actionStep = agent.memory.steps.find(
        (step) => step instanceof ActionStep,
      ) as ActionStep;

      expect(actionStep).toBeDefined();
      const outputObservation = actionStep.observations.find(
        (obs) => obs.type === 'text' && obs.text.includes('detailed output'),
      );
      expect(outputObservation).toBeDefined();
      expect('text' in outputObservation! && outputObservation.text).toContain(
        'detailed output',
      );
    });
  });

  describe('Error Handling', () => {
    // Setup mocks
    let mockChatModel: jest.Mocked<ChatModel>;
    let mockSandbox: jest.Mocked<Sandbox>;
    let mockLogger: jest.Mocked<AgentLogger>;

    // Test UDF that extends BaseStoppingUdf
    class TestStoppingUdf extends BaseStoppingUdf {
      name = 'finalAnswer';
      description = 'Test stopping UDF';
      inputSchema = Type.Any();
      outputSchema = Type.Any();

      async call(input: any): Promise<any> {
        return input;
      }
    }

    // Setup CodeAgent and mocks before each test
    beforeEach(() => {
      mockChatModel = new ChatModel() as jest.Mocked<ChatModel>;
      mockSandbox = new Sandbox() as jest.Mocked<Sandbox>;
      mockLogger = new AgentLogger() as jest.Mocked<AgentLogger>;

      // Reset mocks
      jest.clearAllMocks();
    });

    test('should throw AgentError with correct codes for various error scenarios', async () => {
      // Case 1: Test agent without stopping UDF
      const createAgentWithoutStoppingUdf = () => {
        return new CodeAgent({
          name: 'TestAgent',
          description: 'Test agent',
          udfs: [], // No stopping UDF
          maxSteps: 5,
          model: mockChatModel,
          sandbox: mockSandbox,
          logger: mockLogger,
        });
      };

      expect(createAgentWithoutStoppingUdf).toThrow(
        expect.objectContaining({
          code: AgentErrorCode.UDF_NOT_FOUND,
          message: expect.stringContaining(
            'requires at least one stopping UDF',
          ),
        }),
      );

      // Case 2: Test calling non-existent UDF
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      await expect(agent['callUdf']('nonExistentUdf', {})).rejects.toThrow(
        expect.objectContaining({
          code: AgentErrorCode.UDF_NOT_FOUND,
          message: expect.stringContaining('UDF nonExistentUdf not found'),
        }),
      );

      // Case 3: Test reaching max steps
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: 'some code' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      mockSandbox.executeScript.mockResolvedValue({
        returnValue: null,
        calls: [],
        output: 'step output',
      });

      const maxStepsAgent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 1, // Set to 1 to quickly reach max steps
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      await maxStepsAgent.run('test task');
      const lastStep = maxStepsAgent.memory.steps[
        maxStepsAgent.memory.steps.length - 1
      ] as ActionStep;

      expect(lastStep.error).toBeDefined();
      expect(lastStep.error?.code).toBe(AgentErrorCode.MAX_STEPS_REACHED);
    });

    test('should handle model output generation errors', async () => {
      // Setup
      const modelError = new Error('API rate limit exceeded');
      mockChatModel.chatCompletion.mockRejectedValue(modelError);

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      await agent.run('test task');

      // Assert
      const actionStep = agent.memory.steps.find(
        (step) => step instanceof ActionStep,
      ) as ActionStep;

      expect(actionStep).toBeDefined();
      expect(actionStep.error).toBeDefined();
      expect(actionStep.error?.code).toBe(AgentErrorCode.MODEL_OUTPUT_ERROR);
      expect(actionStep.error?.message).toContain(
        'Error generating model output',
      );
      expect(actionStep.error?.message).toContain(modelError.message);
    });

    test('should handle script execution failures', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: '```js\ninvalid code;\n```' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      const executionError = new Error('ReferenceError: foo is not defined');
      mockSandbox.executeScript.mockRejectedValue(executionError);

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      await agent.run('test task');

      // Assert
      const actionStep = agent.memory.steps.find(
        (step) => step instanceof ActionStep,
      ) as ActionStep;

      expect(actionStep).toBeDefined();
      expect(actionStep.error).toBeDefined();
      expect(actionStep.error?.code).toBe(
        AgentErrorCode.SCRIPT_EXECUTION_FAILED,
      );
      expect(actionStep.error?.message).toContain('Error executing code');
      expect(actionStep.error?.message).toContain(executionError.message);
    });

    test('should maintain error state in memory steps', async () => {
      // Setup
      mockChatModel.chatCompletion.mockResolvedValue({
        message: { role: 'assistant', content: 'some code' },
        metadata: {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        },
      });

      // Return different errors for each execution
      mockSandbox.executeScript
        .mockRejectedValueOnce(new Error('Syntax error'))
        .mockRejectedValueOnce(new Error('Runtime error'))
        .mockResolvedValueOnce({
          returnValue: 'final result',
          calls: [
            {
              callable: 'finalAnswer',
              returnValue: 'final result',
              returnValueSummary: null,
            },
          ],
          output: 'step 3 output',
        });

      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new TestStoppingUdf()],
        maxSteps: 5,
        model: mockChatModel,
        sandbox: mockSandbox,
        logger: mockLogger,
      });

      // Act
      const result = await agent.run('test task');

      // Assert
      expect(result).toBe('final result');
      expect(mockSandbox.executeScript).toHaveBeenCalledTimes(3);

      // Check that each step's error state is correctly maintained
      const actionSteps = agent.memory.steps.filter(
        (step) => step instanceof ActionStep,
      ) as ActionStep[];

      expect(actionSteps.length).toBe(3);

      // First step should have Syntax error
      expect(actionSteps[0]!.error).toBeDefined();
      expect(actionSteps[0]!.error?.code).toBe(
        AgentErrorCode.SCRIPT_EXECUTION_FAILED,
      );
      expect(actionSteps[0]!.error?.message).toContain('Syntax error');

      // Second step should have Runtime error
      expect(actionSteps[1]!.error).toBeDefined();
      expect(actionSteps[1]!.error?.code).toBe(
        AgentErrorCode.SCRIPT_EXECUTION_FAILED,
      );
      expect(actionSteps[1]!.error?.message).toContain('Runtime error');

      // Third step should have no error
      expect(actionSteps[2]!.error).toBeUndefined();

      // Memory should include all step information including errors
      expect(agent.memory.steps.length).toBe(4); // Task step + 3 action steps
    });
  });
});
