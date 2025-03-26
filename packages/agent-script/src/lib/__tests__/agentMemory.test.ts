import { AgentMemory } from '../agentMemory';
import { ActionStep, PlanningStep, TaskStep } from '../agentMemory';
import { AgentLogger } from '../agentLogger';

describe('AgentMemory', () => {
  let agentMemory: AgentMemory;
  const systemPrompt = 'Test system prompt';

  beforeEach(() => {
    agentMemory = new AgentMemory(systemPrompt);
  });

  test('should initialize with system prompt', () => {
    expect(agentMemory.systemPrompt).toBeDefined();
    expect(agentMemory.systemPrompt.systemPrompt).toBe(systemPrompt);
  });

  test('should start with empty steps', () => {
    expect(agentMemory.steps).toHaveLength(0);
  });

  test('reset() should clear all steps', () => {
    agentMemory.steps.push(new ActionStep({ stepNumber: 1 }));
    agentMemory.reset();
    expect(agentMemory.steps).toHaveLength(0);
  });

  test('getSuccinctSteps() should return summarized steps', () => {
    const actionStep = new ActionStep({
      stepNumber: 1,
      modelOutput: 'Test output',
      observations: [{ type: 'text', text: 'Test observation' }],
    });
    const taskStep = new TaskStep({ task: 'Test task' });

    agentMemory.steps.push(actionStep);
    agentMemory.steps.push(taskStep);

    const steps = agentMemory.getSuccinctSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0]?.content).toContain('Observation:\nTest observation');
    expect(steps[1]?.content).toContain('Test task');
  });

  test('replay() should log steps correctly', () => {
    const mockLogger = new AgentLogger();
    const consoleSpy = jest.spyOn(mockLogger.console, 'log');

    const actionStep = new ActionStep({
      stepNumber: 1,
      modelOutput: 'Test output',
    });
    agentMemory.steps.push(actionStep);

    agentMemory.replay(mockLogger);

    expect(consoleSpy).toHaveBeenCalledWith("Replaying the agent's steps:");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Step 1'));
  });

  test('should handle different step types', () => {
    const actionStep = new ActionStep({ stepNumber: 1 });
    const planningStep = new PlanningStep({
      modelInputMessages: [],
      modelOutputMessageFacts: { role: 'assistant', content: '' },
      facts: 'Test facts',
      modelOutputMessagePlan: { role: 'assistant', content: '' },
      plan: 'Test plan',
    });
    const taskStep = new TaskStep({ task: 'Test task' });

    agentMemory.steps.push(actionStep);
    agentMemory.steps.push(planningStep);
    agentMemory.steps.push(taskStep);

    expect(agentMemory.steps).toHaveLength(3);
    expect(agentMemory.steps[0]).toBeInstanceOf(ActionStep);
    expect(agentMemory.steps[1]).toBeInstanceOf(PlanningStep);
    expect(agentMemory.steps[2]).toBeInstanceOf(TaskStep);
  });

  test('replay() with detailed flag should show more information', () => {
    const mockLogger = new AgentLogger();
    const logMarkdownSpy = jest.spyOn(mockLogger, 'logMarkdown');

    const actionStep = new ActionStep({
      stepNumber: 1,
      modelInputMessages: [{ role: 'user', content: 'Test input' }],
      modelOutput: 'Test output',
    });
    agentMemory.steps.push(actionStep);

    agentMemory.replay(mockLogger, true);

    expect(logMarkdownSpy).toHaveBeenCalledWith({
      title: 'Agent output:',
      content: 'Test output',
    });
  });
});
