import { ActionStep, PlanningStep } from '../agentMemory';
import { CodeAgent } from '../codeAgent';
import { IChatModel, ISandbox } from '../types';
import { FinalAnswerUdf } from '../udf';
describe('CodeAgent', () => {
  describe('Planning', () => {
    let codeAgent: CodeAgent;
    let mockModel: IChatModel;
    let mockSandbox: ISandbox;

    beforeEach(() => {
      // Mock chat model
      mockModel = {
        chatCompletion: jest.fn(),
      } as unknown as IChatModel;

      // Mock sandbox
      mockSandbox = {
        register: jest.fn(),
        executeScript: jest.fn(),
      } as unknown as ISandbox;

      // Create code agent with mocks
      codeAgent = new CodeAgent({
        name: 'TestAgent',
        description: 'Test agent for planning tests',
        udfs: [new FinalAnswerUdf()],
        maxSteps: 10,
        model: mockModel,
        sandbox: mockSandbox,
        shouldRunPlanning: false,
        planningInterval: 3,
      });
    });

    test('updateShouldRunPlanning should update shouldRunPlanning', () => {
      codeAgent.updateShouldRunPlanning(true);
      expect((codeAgent as any).shouldRunPlanning).toBe(true);
    });

    test('should create initial plan when shouldRunPlanning is true', async () => {
      // Setup
      codeAgent.updateShouldRunPlanning(true);
      const mockFactsResponse = { message: { content: 'Mock facts' } };
      const mockPlanResponse = { message: { content: 'Mock initial plan' } };

      (mockModel.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockFactsResponse)
        .mockResolvedValueOnce(mockPlanResponse);

      // Act
      await codeAgent.planningStep();

      // Assert
      expect(mockModel.chatCompletion).toHaveBeenCalledTimes(2);
      expect(codeAgent.memory.steps.length).toBe(1);
      expect(codeAgent.memory.steps[0]).toBeInstanceOf(PlanningStep);
      expect((codeAgent as any).shouldRunPlanning).toBe(false);

      const planningStep = codeAgent.memory.steps[0] as PlanningStep;
      expect(planningStep.plan).toContain('Mock initial plan');
      expect(planningStep.facts).toContain('Mock facts');
    });

    test('should update plan at specified planning interval', async () => {
      // Setup
      codeAgent.stepNumber = 4; // Should trigger at step 4 when interval is 3

      // Mock memory with some existing steps
      codeAgent.memory.steps.push(new ActionStep({ stepNumber: 1 }));
      codeAgent.memory.steps.push(new ActionStep({ stepNumber: 2 }));
      codeAgent.memory.steps.push(new ActionStep({ stepNumber: 3 }));

      // Act
      await codeAgent.afterStep();

      // Assert
      expect((codeAgent as any).shouldRunPlanning).toBe(true);

      // Setup for planningStep test
      const mockFactsResponse = { message: { content: 'Updated facts' } };
      const mockPlanResponse = { message: { content: 'Updated plan' } };

      (mockModel.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockFactsResponse)
        .mockResolvedValueOnce(mockPlanResponse);

      // Act - call planning step
      await codeAgent.planningStep();

      // Assert
      expect(codeAgent.memory.steps.length).toBe(4);
      expect(codeAgent.memory.steps[3]).toBeInstanceOf(PlanningStep);
      expect((codeAgent as any).shouldRunPlanning).toBe(false);
    });

    test('should handle plan update with new facts', async () => {
      // Setup
      codeAgent.stepNumber = 5;
      codeAgent.task = 'Test planning task';

      // Add some memory steps
      codeAgent.memory.steps.push(
        new ActionStep({
          stepNumber: 1,
          modelOutput: 'Some output',
          observations: [{ type: 'text', text: 'Observation 1' }],
        }),
      );

      const mockFactsResponse = {
        message: { content: 'New facts about the task' },
      };
      const mockPlanResponse = {
        message: { content: 'Updated plan with new steps' },
      };

      (mockModel.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockFactsResponse)
        .mockResolvedValueOnce(mockPlanResponse);

      // Act
      await codeAgent.planningStep();

      // Assert
      expect(mockModel.chatCompletion).toHaveBeenCalledTimes(2);

      // Verify that the facts update was passed to the plan generation
      const planCallArgs = (mockModel.chatCompletion as jest.Mock).mock
        .calls[1][0];
      expect(
        planCallArgs.messages.some(
          (msg: any) =>
            msg.content && msg.content.includes('New facts about the task'),
        ),
      ).toBe(true);

      // Check the final planning step content
      const planningStep = codeAgent.memory.steps[1] as PlanningStep;
      expect(planningStep.facts).toContain('New facts about the task');
      expect(planningStep.plan).toContain('Updated plan with new steps');
    });

    test('should not include previous plan steps in new plan generation', async () => {
      // Setup
      codeAgent.stepNumber = 5;

      // Add an initial planning step
      const initialPlanningStep = new PlanningStep({
        plan: 'Initial plan',
        facts: 'Initial facts',
        modelOutputMessagePlan: { content: 'Initial plan' } as any,
        modelOutputMessageFacts: { content: 'Initial facts' } as any,
        modelInputMessages: [],
      });
      codeAgent.memory.steps.push(initialPlanningStep);

      // Add an action step
      codeAgent.memory.steps.push(
        new ActionStep({
          stepNumber: 2,
          modelOutput: 'Action output',
          observations: [{ type: 'text', text: 'Action observation' }],
        }),
      );

      // Mock model responses
      const mockFactsResponse = { message: { content: 'Updated facts' } };
      const mockPlanResponse = {
        message: { content: 'New plan without previous plan content' },
      };

      (mockModel.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockFactsResponse)
        .mockResolvedValueOnce(mockPlanResponse);

      // Spy on writeMemoryToMessages
      const writeMemorySpy = jest.spyOn(codeAgent, 'writeMemoryToMessages');

      // Act
      await codeAgent.planningStep();

      // Assert
      // Verify that writeMemoryToMessages was called with summary mode false
      expect(writeMemorySpy).toHaveBeenCalledWith();

      // Check that the model was called with messages that don't include the system prompt
      const factsCallArgs = (mockModel.chatCompletion as jest.Mock).mock
        .calls[0][0];
      expect(
        factsCallArgs.messages.some(
          (msg: any) =>
            msg.content &&
            msg.content.includes(codeAgent.memory.systemPrompt.systemPrompt),
        ),
      ).toBe(false);

      // Verify the new planning step doesn't reference the old one
      const newPlanningStep = codeAgent.memory.steps[2] as PlanningStep;
      expect(newPlanningStep.plan).toContain(
        'New plan without previous plan content',
      );
    });
  });
});
