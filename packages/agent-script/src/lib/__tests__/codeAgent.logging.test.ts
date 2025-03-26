import { CodeAgent } from '../codeAgent';
import { AgentLogger } from '../agentLogger';
import { LogLevel } from '../types';
import { FinalAnswerUdf } from '../udf';

describe('CodeAgent logging functionality', () => {
  let mockLogger: AgentLogger;
  let agent: CodeAgent;

  beforeEach(() => {
    // Create a spy logger
    mockLogger = new AgentLogger();
    jest.spyOn(mockLogger, 'logTask');
    jest.spyOn(mockLogger, 'logRule');
    jest.spyOn(mockLogger, 'log');
    jest.spyOn(mockLogger, 'logMarkdown');

    // Create a simple agent with mock dependencies
    agent = new CodeAgent({
      name: 'TestAgent',
      description: 'Test agent for logging',
      udfs: [new FinalAnswerUdf()],
      maxSteps: 3,
      logger: mockLogger,
    });

    // Mock model to avoid real API calls
    agent.model.chatCompletion = jest.fn().mockResolvedValue({
      message: {
        role: 'assistant',
        content: '```js\nconsole.log("test");\n```',
      },
    });

    // Mock sandbox to avoid real execution
    agent.sandbox.executeScript = jest.fn().mockResolvedValue({
      returnValue: null,
      calls: [],
      output: 'Mock execution output',
    });
  });

  test('should log task start correctly', async () => {
    const task = 'Test task for logging';

    // Run agent with the test task
    await agent.run(task);

    // Verify the task was logged correctly
    expect(mockLogger.logTask).toHaveBeenCalledWith(task);
  });

  test('should log step execution details', async () => {
    const task = 'Step logging test task';

    // Run the agent
    await agent.run(task);

    // Verify step log was created
    expect(mockLogger.logRule).toHaveBeenCalledWith(`Step 1`, LogLevel.INFO);

    // Verify model output was logged
    expect(mockLogger.logMarkdown).toHaveBeenCalledWith({
      content: expect.stringContaining('```js\nconsole.log("test");\n```'),
      title: '--- Output message of the LLM ---',
    });
  });

  test('should log planning steps', async () => {
    const task = 'Planning test task';

    // Configure agent to use planning
    agent = new CodeAgent({
      name: 'PlanningAgent',
      description: 'Test agent for planning logging',
      udfs: [new FinalAnswerUdf()],
      maxSteps: 3,
      logger: mockLogger,
      shouldRunPlanning: true,
    });

    // Mock planning-related model calls
    agent.model.chatCompletion = jest
      .fn()
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'Facts about task' },
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Step 1: Do something\nStep 2: Finish task',
        },
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: '```js\nconsole.log("executing plan");\n```',
        },
      });

    // Run the agent
    await agent.run(task);

    // Verify planning log
    expect(mockLogger.logRule).toHaveBeenCalledWith(
      'Initial plan',
      LogLevel.INFO,
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Step 1: Do something'),
    );
  });

  test('should log script execution results', async () => {
    const task = 'Script execution logging test';
    const executionOutput = 'Script executed successfully with test output';

    // Mock the sandbox execution to return specific output
    agent.sandbox.executeScript = jest.fn().mockResolvedValue({
      returnValue: null,
      calls: [],
      output: executionOutput,
    });

    // Run the agent
    await agent.run(task);

    // Verify script execution results were logged
    expect(mockLogger.logMarkdown).toHaveBeenCalledWith({
      content: executionOutput,
      title: '-- Script execution results --',
    });
  });

  test('should log when script execution has no output', async () => {
    const task = 'Script with no output test';

    // Mock the sandbox execution to return empty output
    agent.sandbox.executeScript = jest.fn().mockResolvedValue({
      returnValue: null,
      calls: [],
      output: '',
    });

    // Run the agent
    await agent.run(task);

    // Verify empty output message was logged
    expect(mockLogger.logMarkdown).toHaveBeenCalledWith({
      content: 'No output from script execution',
      title: '-- Script execution results --',
    });
  });
});
