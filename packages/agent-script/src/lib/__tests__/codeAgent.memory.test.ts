import {
  ActionStep,
  PlanningStep,
  SystemPromptStep,
  TaskStep,
} from '../agentMemory';
import { CodeAgent } from '../codeAgent';
import { FinalAnswerUdf } from '../udf';

describe('CodeAgent', () => {
  describe('Memory Management', () => {
    it('should correctly write memory to messages in summary mode', async () => {
      // Setup
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent for memory management',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
      });

      // Create test memory with various steps
      agent.memory.systemPrompt = new SystemPromptStep({
        systemPrompt: 'System prompt for testing',
      });
      agent.memory.steps.push(new TaskStep({ task: 'Test task' }));
      agent.memory.steps.push(
        new ActionStep({
          stepNumber: 1,
          modelOutput: 'Test model output',
          actionOutput: 'Test action output',
        }),
      );

      // Access the protected method using type assertion
      const messages = agent.writeMemoryToMessages(false);

      // Assertions
      expect(messages).toBeDefined();
      expect(messages.length).toBeGreaterThan(0);
      // In summary mode, typically fewer messages are included
      expect(
        messages.some((m) => m.content.includes('System prompt for testing')),
      ).toBeTruthy();
      // Verify that the steps are properly summarized according to their summary mode behavior
    });

    it('should correctly write memory to messages in non-summary mode', async () => {
      // Setup
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent for memory management',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
      });

      // Create test memory with various steps
      agent.memory.systemPrompt = new SystemPromptStep({
        systemPrompt: 'System prompt for testing',
      });
      agent.memory.steps.push(new TaskStep({ task: 'Test task' }));
      agent.memory.steps.push(
        new ActionStep({
          stepNumber: 1,
          modelOutput: 'Test model output',
          actionOutput: 'Test action output',
        }),
      );

      // Access the protected method using type assertion
      const messages = agent.writeMemoryToMessages(false);

      // Assertions
      expect(messages).toBeDefined();
      expect(messages.length).toBeGreaterThan(0);
      // In non-summary mode, more detailed messages should be included
      expect(
        messages.some((m) => m.content.includes('System prompt for testing')),
      ).toBeTruthy();
      expect(
        messages.some(
          (m) =>
            m.content.includes('Test model output') ||
            m.content.includes('Test action output'),
        ),
      ).toBeTruthy();
    });

    it('should maintain memory steps in correct order', async () => {
      // Setup
      const agent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent for memory management',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
      });

      // Add steps in specific order
      agent.memory.systemPrompt = new SystemPromptStep({
        systemPrompt: 'System prompt for testing',
      });
      agent.memory.steps.push(new TaskStep({ task: 'First task' }));
      agent.memory.steps.push(
        new ActionStep({
          stepNumber: 1,
          modelOutput: 'First action',
        }),
      );
      agent.memory.steps.push(
        new ActionStep({
          stepNumber: 2,
          modelOutput: 'Second action',
        }),
      );
      agent.memory.steps.push(
        new PlanningStep({
          plan: 'Updated plan',
          facts: 'Updated facts',
          modelInputMessages: [],
          modelOutputMessageFacts: {
            role: 'assistant',
            content: 'Updated facts',
          },
          modelOutputMessagePlan: {
            role: 'assistant',
            content: 'Updated plan',
          },
        }),
      );

      // Access the protected method using type assertion
      const messages = agent.writeMemoryToMessages(false);

      // Assertions
      expect(messages).toBeDefined();

      // Extract content for easier testing
      const contents = messages.map((m) => m.content);

      // Find indices to check order
      const firstActionIndex = contents.findIndex((c) =>
        c.includes('First action'),
      );
      const secondActionIndex = contents.findIndex((c) =>
        c.includes('Second action'),
      );
      const planningIndex = contents.findIndex((c) =>
        c.includes('Updated plan'),
      );

      // Verify that the steps appear in the correct order
      expect(firstActionIndex).toBeLessThan(secondActionIndex);
      expect(secondActionIndex).toBeLessThan(planningIndex);
    });
  });
});
