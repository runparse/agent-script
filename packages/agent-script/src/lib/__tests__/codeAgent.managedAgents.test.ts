import { Type } from '@sinclair/typebox';
import { CodeAgent } from '../codeAgent';
import { CallAgentUdf, FinalAnswerUdf } from '../udf/index';
import { AgentError, AgentErrorCode } from '../errors';
import { IAgent } from '../types';

// Mock the ChatModel to avoid actual API calls
jest.mock('../chatModel', () => {
  return {
    ChatModel: jest.fn().mockImplementation(() => {
      return {
        chatCompletion: jest.fn().mockResolvedValue({
          message: { role: 'assistant', content: 'Test response' },
        }),
      };
    }),
  };
});

// Mock the Sandbox to avoid actual script execution
jest.mock('../sandbox', () => {
  return {
    Sandbox: jest.fn().mockImplementation(() => {
      return {
        register: jest.fn(),
        executeScript: jest.fn().mockResolvedValue({
          returnValue: 'test result',
          calls: [{ callable: 'finalAnswer', returnValue: 'final answer' }],
          output: 'script output',
        }),
      };
    }),
  };
});

describe('CodeAgent', () => {
  describe('Managed Agents', () => {
    const createMockAgent = (
      name: string,
      mockImplementation?: any,
    ): IAgent => {
      const mockAgent: IAgent = {
        task: 'test task',
        name,
        description: `Mock agent: ${name}`,
        outputSchema: Type.String(),
        call:
          mockImplementation ||
          jest.fn().mockResolvedValue('Agent call result'),
      };
      return mockAgent;
    };

    test('should create CallAgentUdf for each managed agent', () => {
      // Create mock managed agents
      const managedAgent1 = createMockAgent('agent1');
      const managedAgent2 = createMockAgent('agent2');

      // Create the code agent with managed agents
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent with managed agents',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
        managedAgents: [managedAgent1, managedAgent2],
      });

      // Check if CallAgentUdf instances were created for each managed agent
      const callAgentUdfs = agent.udfs.filter(
        (udf) => udf instanceof CallAgentUdf,
      );

      expect(callAgentUdfs.length).toBe(2);
      expect(callAgentUdfs[0]!.name).toBe('callAgent1');
      expect(callAgentUdfs[1]!.name).toBe('callAgent2');
      expect(agent.sandbox.register).toHaveBeenCalledWith(
        'callAgent1',
        expect.any(Function),
      );
      expect(agent.sandbox.register).toHaveBeenCalledWith(
        'callAgent2',
        expect.any(Function),
      );
    });

    test('should format task correctly for managed agents', async () => {
      // Create a mock managed agent
      const mockAgent = createMockAgent('testAgent');
      mockAgent.call = jest.fn().mockImplementation(async (task) => {
        // Return the task to verify it was formatted correctly
        return `Task received: ${task}`;
      });

      // Create the code agent
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
        managedAgents: [mockAgent],
      });

      // Use the original prompts which should include something like:
      // "You are {{name}}. Your task is: {{task}}"

      // Call the managed agent method directly
      agent.name = 'ManagedAgent';
      const result = await agent.call('Do something specific', {});

      // Check if the task includes the agent name
      expect(result).toContain('ManagedAgent');
      expect(result).toContain(
        "Here is the final answer from your managed agent 'ManagedAgent':\n  test result",
      );
    });

    test('should format report correctly from managed agent output', async () => {
      // Create the code agent with a mock for the run method
      const agent = new CodeAgent({
        name: 'ReportAgent',
        description: 'Test agent for report formatting',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
        managedAgents: [],
      });

      // Mock the run method to return a simple output
      agent.run = jest.fn().mockResolvedValue('This is the agent output');

      // Call the managed agent method
      const result = await agent.call('Test task', {});

      // The report should include the agent name and the final answer
      expect(result).toContain('ReportAgent');
      expect(result).toContain('This is the agent output');
    });

    test('should handle managed agent execution errors', async () => {
      // Create a mock error-throwing agent
      const errorAgent = createMockAgent('errorAgent');
      errorAgent.call = jest.fn().mockImplementation(() => {
        throw new AgentError({
          message: 'Test error in managed agent',
          code: AgentErrorCode.SCRIPT_EXECUTION_FAILED,
        });
      });

      // Create the code agent with a test stopping UDF
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
        managedAgents: [errorAgent],
      });

      // Find the CallAgentUdf that was created for the error agent
      const callUdf = agent.udfs.find(
        (udf) => udf instanceof CallAgentUdf && udf.name === 'callErrorAgent',
      );

      // Attempt to call the UDF via the agent's callUdf method
      await expect(
        agent.callUdf(callUdf!.name, { task: 'test task' }),
      ).rejects.toThrow(/Error when calling UDF/);

      // Verify the error agent's call method was invoked
      expect(errorAgent.call).toHaveBeenCalled();
    });
  });
});
