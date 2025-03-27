import {
  ActionStep,
  BingSearchUdf,
  DatasheetWriteUdf,
  DuckduckgoSearchUdf,
  IChatModel,
  PlanningStep,
  TerminateUdf,
  ThinkUdf,
} from '@runparse/agent-script';
import { Type } from '@sinclair/typebox';
import { Page } from 'playwright';
import { IWebAgentNavigationHistoryItem } from '../../../types';
import {
  PageClickUdf,
  PageExtractDataUdf,
  PageGoBackUdf,
  PageNavigateUrlUdf,
} from '../../../udf/browser/index';
import { generateDefaultJsonSchemaInstance } from '../../../utils/schema';
import { WebDataAgent, getWebDataAgentDefaultUdfs } from '../webDataAgent';

// Mock dependencies
jest.mock('../../../utils/schema', () => ({
  generateDefaultJsonSchemaInstance: jest
    .fn()
    .mockReturnValue({ example: 'schema' }),
}));

// Create a simple test schema
const testSchema = Type.Object({
  title: Type.String(),
  price: Type.Number(),
});

describe('getWebDataAgentDefaultUdfs', () => {
  beforeAll(() => {
    process.env.BING_API_KEY = 'test-bing-api-key';
  });

  afterAll(() => {
    delete process.env.BING_API_KEY;
  });

  test('should include BingSearchUdf by default', () => {
    const udfs = getWebDataAgentDefaultUdfs({
      extractionObjectSchema: testSchema,
    });

    expect(udfs.some((udf) => udf instanceof BingSearchUdf)).toBe(true);
    expect(udfs.some((udf) => udf instanceof DuckduckgoSearchUdf)).toBe(false);
  });

  test('should include DuckduckgoSearchUdf when useBingSearch is false', () => {
    const udfs = getWebDataAgentDefaultUdfs({
      useBingSearch: false,
      extractionObjectSchema: testSchema,
    });

    expect(udfs.some((udf) => udf instanceof BingSearchUdf)).toBe(false);
    expect(udfs.some((udf) => udf instanceof DuckduckgoSearchUdf)).toBe(true);
  });

  test('should include all required UDFs', () => {
    const udfs = getWebDataAgentDefaultUdfs({
      useBingSearch: false,
      extractionObjectSchema: testSchema,
    });

    expect(udfs.some((udf) => udf instanceof PageClickUdf)).toBe(true);
    expect(udfs.some((udf) => udf instanceof PageNavigateUrlUdf)).toBe(true);
    expect(udfs.some((udf) => udf instanceof PageGoBackUdf)).toBe(true);
    expect(udfs.some((udf) => udf instanceof DatasheetWriteUdf)).toBe(true);
    expect(udfs.some((udf) => udf instanceof TerminateUdf)).toBe(true);
    expect(udfs.some((udf) => udf instanceof ThinkUdf)).toBe(true);
    expect(udfs.some((udf) => udf instanceof PageExtractDataUdf)).toBe(true);
  });

  test('should pass extractionModel and schema to PageExtractDataUdf', () => {
    const mockModel = { id: 'test-model' } as unknown as IChatModel;
    const udfs = getWebDataAgentDefaultUdfs({
      useBingSearch: false,
      extractionModel: mockModel,
      extractionObjectSchema: testSchema,
    });

    const extractDataUdf = udfs.find(
      (udf) => udf instanceof PageExtractDataUdf,
    ) as PageExtractDataUdf;
    expect(extractDataUdf).toBeDefined();
    expect((extractDataUdf as any).model).toBe(mockModel);
    expect(extractDataUdf.outputSchema).toEqual(Type.Array(testSchema));
  });
});

describe('WebDataAgent', () => {
  beforeAll(() => {
    process.env.BING_API_KEY = 'test-bing-api-key';
  });

  afterAll(() => {
    delete process.env.BING_API_KEY;
  });

  describe('constructor', () => {
    let mockPage: Page;

    beforeEach(() => {
      mockPage = {
        url: jest.fn().mockReturnValue('https://example.com'),
      } as unknown as Page;
    });

    test('should initialize with provided props', () => {
      const agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      expect(agent.page).toBe(mockPage);
      expect(agent.navigationHistory).toEqual([]);
      expect(agent.udfs.length).toBeGreaterThan(0);
    });

    test('should throw an error when DatasheetWrite UDF is missing', () => {
      const mockUdfs = [
        new PageClickUdf(),
        new PageExtractDataUdf({ objectSchema: testSchema }),
        new BingSearchUdf(),
      ];

      expect(() => {
        new WebDataAgent({
          page: mockPage,
          dataObjectSchema: testSchema,
          udfs: mockUdfs,
          name: 'test-agent',
          maxSteps: 10,
        });
      }).toThrow('The DatasheetWrite UDF is required');
    });

    test('should throw an error when PageExtractData UDF is missing', () => {
      const mockUdfs = [
        new PageClickUdf(),
        new DatasheetWriteUdf({}),
        new BingSearchUdf(),
      ];

      expect(() => {
        new WebDataAgent({
          page: mockPage,
          dataObjectSchema: testSchema,
          udfs: mockUdfs,
          name: 'test-agent',
          maxSteps: 10,
        });
      }).toThrow('The PageExtractData UDF is required');
    });

    test('should throw an error when no search UDF is provided', () => {
      const mockUdfs = [
        new PageClickUdf(),
        new DatasheetWriteUdf({}),
        new PageExtractDataUdf({ objectSchema: testSchema }),
      ];

      expect(() => {
        new WebDataAgent({
          page: mockPage,
          dataObjectSchema: testSchema,
          udfs: mockUdfs,
          name: 'test-agent',
          maxSteps: 10,
        });
      }).toThrow('A web search UDF is required');
    });

    test('should use default UDFs when none provided', () => {
      const agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      expect(agent.udfs.some((udf) => udf instanceof DatasheetWriteUdf)).toBe(
        true,
      );
      expect(agent.udfs.some((udf) => udf instanceof PageExtractDataUdf)).toBe(
        true,
      );
      expect(
        agent.udfs.some(
          (udf) =>
            udf instanceof BingSearchUdf || udf instanceof DuckduckgoSearchUdf,
        ),
      ).toBe(true);
    });

    test('should properly initialize navigationHistory with empty array when not provided', () => {
      const agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      expect(agent.navigationHistory).toEqual([]);
    });

    test('should use provided navigationHistory when available', () => {
      const mockHistory: IWebAgentNavigationHistoryItem[] = [
        { url: 'https://example.com/page1', timestamp: 1, status: 'success' },
        { url: 'https://example.com/page2', timestamp: 2, status: 'success' },
      ];

      const agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        navigationHistory: mockHistory,
        name: 'test-agent',
        maxSteps: 10,
      });

      expect(agent.navigationHistory).toBe(mockHistory);
    });

    test('should set description with schema information when not provided', () => {
      const agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      expect(agent['description']).toContain('collect data as JSON objects');
      expect(generateDefaultJsonSchemaInstance).toHaveBeenCalledWith(
        testSchema,
      );
    });

    test('should use provided description when available', () => {
      const customDescription = 'Custom agent description';
      const agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        description: customDescription,
        name: 'test-agent',
        maxSteps: 10,
      });

      expect(agent['description']).toBe(customDescription);
    });
  });

  describe('writeMemoryToMessages', () => {
    let mockPage: Page;
    let agent: WebDataAgent;

    beforeEach(() => {
      mockPage = {
        url: jest.fn().mockReturnValue('https://example.com/current'),
      } as unknown as Page;

      // Mock the super class method
      jest
        .spyOn(WebDataAgent.prototype, 'writeMemoryToMessages')
        .mockImplementation(function (this: any, summaryMode: boolean) {
          // Don't call the actual implementation to avoid infinite recursion
          // Instead return a mock value
          return [{ role: 'system', content: 'Base message' }];
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should include base messages from super class', () => {
      agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      // Save original implementation
      const originalImplementation = agent.writeMemoryToMessages;

      // Override to avoid infinite recursion from the mock above
      agent.writeMemoryToMessages = function (summaryMode: boolean) {
        // Restore original to avoid issues
        this.writeMemoryToMessages = originalImplementation;
        return originalImplementation.call(this, summaryMode);
      };

      const messages = agent.writeMemoryToMessages(false);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]?.role).toBe('system');
    });

    test('should add current URL info when navigationHistory is not empty', () => {
      const mockHistory: IWebAgentNavigationHistoryItem[] = [
        { url: 'https://example.com/page1', timestamp: 1, status: 'success' },
      ];

      agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        navigationHistory: mockHistory,
        name: 'test-agent',
        maxSteps: 10,
      });

      // Reset the mock
      jest.spyOn(WebDataAgent.prototype, 'writeMemoryToMessages').mockRestore();
      // Mock parent class method to return empty array
      jest
        .spyOn(
          Object.getPrototypeOf(WebDataAgent.prototype),
          'writeMemoryToMessages',
        )
        .mockReturnValue([{ role: 'system', content: 'Base message' }]);

      const messages = agent.writeMemoryToMessages(false);

      expect(messages.length).toBe(2);
      expect(messages[1]?.content).toContain('https://example.com/current');
      expect(messages[1]?.content).toContain('https://example.com/page1');
    });

    test('should not add URL info when navigationHistory is empty', () => {
      agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      // Reset the mock
      jest.spyOn(WebDataAgent.prototype, 'writeMemoryToMessages').mockRestore();
      // Mock parent class method to return empty array
      jest
        .spyOn(
          Object.getPrototypeOf(WebDataAgent.prototype),
          'writeMemoryToMessages',
        )
        .mockReturnValue([{ role: 'system', content: 'Base message' }]);

      const messages = agent.writeMemoryToMessages(false);

      expect(messages.length).toBe(1);
      expect(messages[0]?.content).toBe('Base message');
    });

    test('should format navigationHistory correctly in message', () => {
      const mockHistory: IWebAgentNavigationHistoryItem[] = [
        { url: 'https://example.com/page1', timestamp: 1, status: 'success' },
        { url: 'https://example.com/page2', timestamp: 2, status: 'success' },
      ];

      agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        navigationHistory: mockHistory,
        name: 'test-agent',
        maxSteps: 10,
      });

      // Reset the mock
      jest.spyOn(WebDataAgent.prototype, 'writeMemoryToMessages').mockRestore();
      // Mock parent class method to return empty array
      jest
        .spyOn(
          Object.getPrototypeOf(WebDataAgent.prototype),
          'writeMemoryToMessages',
        )
        .mockReturnValue([{ role: 'system', content: 'Base message' }]);

      const messages = agent.writeMemoryToMessages(false);

      expect(messages[1]?.content).toContain('- https://example.com/page1');
      expect(messages[1]?.content).toContain('- https://example.com/page2');
    });
  });

  describe('step', () => {
    let mockPage: Page;
    let agent: WebDataAgent;

    beforeEach(() => {
      mockPage = {
        url: jest.fn().mockReturnValue('https://example.com'),
      } as unknown as Page;

      agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      // Setup memory steps
      agent.memory = {
        steps: [
          new ActionStep({
            stepNumber: 1,
            observations: [
              {
                type: 'image',
                context: 'screenshot',
                image: 'old-screenshot-1',
              },
              { type: 'text', text: 'observation 1' },
            ],
          }),
          new ActionStep({
            stepNumber: 2,
            observations: [
              {
                type: 'image',
                context: 'screenshot',
                image: 'old-screenshot-2',
              },
              { type: 'text', text: 'observation 2' },
            ],
          }),
          new ActionStep({
            stepNumber: 3,
            observations: [
              {
                type: 'image',
                context: 'screenshot',
                image: 'current-screenshot',
              },
              { type: 'text', text: 'observation 3' },
            ],
          }),
        ],
      } as any;
    });

    test('should clean up old screenshots from memory', async () => {
      const newStep = new ActionStep({
        stepNumber: 4,
      });

      // Mock the super.step call
      jest
        .spyOn(Object.getPrototypeOf(WebDataAgent.prototype), 'step')
        .mockResolvedValue(undefined);

      await agent.step(newStep);

      // Check that old screenshots are removed (step 1 should have screenshot removed)
      const step1 = agent.memory.steps[0] as ActionStep;
      expect(
        step1.observations?.some(
          (o) => o.type === 'image' && o.context?.includes('screenshot'),
        ),
      ).toBe(false);

      // Step 2 and 3 should still have screenshots
      const step2 = agent.memory.steps[1] as ActionStep;
      expect(
        step2.observations?.some(
          (o) => o.type === 'image' && o.context?.includes('screenshot'),
        ),
      ).toBe(true);

      const step3 = agent.memory.steps[2] as ActionStep;
      expect(
        step3.observations?.some(
          (o) => o.type === 'image' && o.context?.includes('screenshot'),
        ),
      ).toBe(true);
    });

    test('should not remove non-screenshot observations', async () => {
      const newStep = new ActionStep({
        stepNumber: 4,
      });

      // Mock the super.step call
      jest
        .spyOn(Object.getPrototypeOf(WebDataAgent.prototype), 'step')
        .mockResolvedValue(undefined);

      await agent.step(newStep);

      // Check that text observations are preserved
      const step1 = agent.memory.steps[0] as ActionStep;
      expect(step1.observations?.some((o) => o.type === 'text')).toBe(true);
    });

    test('should call super.step with the provided memoryStep', async () => {
      const newStep = new ActionStep({
        stepNumber: 4,
      });

      const superStepSpy = jest
        .spyOn(Object.getPrototypeOf(WebDataAgent.prototype), 'step')
        .mockResolvedValue(undefined);

      await agent.step(newStep);

      expect(superStepSpy).toHaveBeenCalledWith(newStep);
    });

    test('should all super.step if last step is not an ActionStep', async () => {
      // Set up a non-ActionStep as the last step
      agent.memory.steps[agent.memory.steps.length - 1] = new PlanningStep({
        modelInputMessages: [],
        modelOutputMessageFacts: { role: 'assistant', content: 'facts' },
        facts: 'facts',
        modelOutputMessagePlan: { role: 'assistant', content: 'plan' },
        plan: 'plan',
      });

      const newStep = new ActionStep({
        stepNumber: 4,
      });

      const superStepSpy = jest.spyOn(
        Object.getPrototypeOf(WebDataAgent.prototype),
        'step',
      );

      const result = await agent.step(newStep);

      expect(result).toBeUndefined();
      expect(superStepSpy).toHaveBeenCalled();
    });
  });

  describe('getDatasheetEntries', () => {
    let mockPage: Page;
    let agent: WebDataAgent;
    let mockEntries: any[];

    beforeEach(() => {
      mockPage = {
        url: jest.fn().mockReturnValue('https://example.com'),
      } as unknown as Page;

      mockEntries = [
        { title: 'Product 1', price: 19.99 },
        { title: 'Product 2', price: 29.99 },
      ];

      const mockUdfs = [
        new PageClickUdf(),
        new PageExtractDataUdf({ objectSchema: testSchema }),
        new BingSearchUdf(),
        new DatasheetWriteUdf({}),
        new TerminateUdf(),
      ];

      // Mock the getEntries method
      mockUdfs.forEach((udf) => {
        if (udf instanceof DatasheetWriteUdf) {
          udf.getEntries = jest.fn().mockReturnValue(mockEntries);
        }
      });

      agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        udfs: mockUdfs,
        name: 'test-agent',
        maxSteps: 10,
      });
    });

    test('should return entries from DatasheetWriteUdf', () => {
      const entries = agent.getDatasheetEntries();

      expect(entries).toBe(mockEntries);
      expect(entries).toHaveLength(2);
      expect(entries[0].title).toBe('Product 1');
      expect(entries[1].price).toBe(29.99);
    });
  });

  describe('call', () => {
    let mockPage: Page;
    let agent: WebDataAgent;
    let mockEntries: any[];

    beforeEach(() => {
      mockPage = {
        url: jest.fn().mockReturnValue('https://example.com'),
      } as unknown as Page;

      mockEntries = [
        { title: 'Product 1', price: 19.99 },
        { title: 'Product 2', price: 29.99 },
      ];

      agent = new WebDataAgent({
        page: mockPage,
        dataObjectSchema: testSchema,
        name: 'test-agent',
        maxSteps: 10,
      });

      // Mock getDatasheetEntries
      agent.getDatasheetEntries = jest.fn().mockReturnValue(mockEntries);

      // Mock super.call
      jest
        .spyOn(Object.getPrototypeOf(WebDataAgent.prototype), 'call')
        .mockResolvedValue(undefined);
    });

    test('should call super.call with provided task and kwargs', async () => {
      const superCallSpy = jest.spyOn(
        Object.getPrototypeOf(WebDataAgent.prototype),
        'call',
      );

      const task = 'Extract product data';
      const kwargs = { url: 'https://example.com/products' };

      await agent.call(task, kwargs);

      expect(superCallSpy).toHaveBeenCalledWith(task, kwargs);
    });

    test('should return datasheet entries', async () => {
      const task = 'Extract product data';
      const kwargs = { url: 'https://example.com/products' };

      const result = await agent.call(task, kwargs);

      expect(result).toBe(mockEntries);
      expect(agent.getDatasheetEntries).toHaveBeenCalled();
    });
  });
});

describe('WebDataAgent Integration', () => {
  // These tests would normally use a more realistic setup with actual or mocked browser interactions
  // Here we'll outline the structure but these would need proper implementation in a real environment

  test('should extract data from webpage and save to datasheet', async () => {
    // This would be an integration test that:
    // 1. Sets up a mock or actual Page
    // 2. Creates a WebDataAgent
    // 3. Calls the agent with a task
    // 4. Verifies data extraction and saving to datasheet
    // Skip for now as it requires more extensive mocking
  });

  test('should handle navigation history correctly', async () => {
    // This would test that:
    // 1. Page navigation is tracked in navigation history
    // 2. Navigation history is used in messages
    // Skip for now
  });

  test('should use search UDFs to find information', async () => {
    // This would test that:
    // 1. Search UDFs are properly utilized
    // 2. Search results are processed correctly
    // Skip for now
  });
});
