import { ActionStep } from '@runparse/agent-script';
import { PageActionUdf } from '../pageUdf';
import { IWebAgent } from '../../../types';
import { Static, Type } from '@sinclair/typebox';
import { PageActionTimeoutError } from '../errors';
jest.useFakeTimers();

jest.mock('../utils', () => ({
  getBase64Screenshot: jest.fn().mockResolvedValue({
    data: 'base64-encoded-screenshot-data',
    mimeType: 'image/png',
  }),
}));

class TestPageActionUdf extends PageActionUdf {
  name = 'TestPageActionUdf';
  description = 'Test page action';

  inputSchema = Type.Object({
    testInput: Type.String(),
  });

  outputSchema = Type.Object({
    testOutput: Type.String(),
  });

  protected async pageActionCall(
    input: Static<typeof this.inputSchema>,
    agent: IWebAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    if (input.testInput === 'timeout') {
      // Make sure this is longer than the timeout period
      await new Promise((resolve) => setTimeout(resolve, this.timeoutMs + 200));
    }
    return { testOutput: 'success' };
  }
}

describe('PageActionUdf', () => {
  let mockAgent: IWebAgent;
  let udf: TestPageActionUdf;

  beforeEach(() => {
    mockAgent = {
      page: {
        screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
        url: jest.fn().mockReturnValue('https://test.com'),
      },
      memory: {
        steps: [new ActionStep({ stepNumber: 1 })],
      },
    } as unknown as IWebAgent;

    udf = new TestPageActionUdf(200);
  });

  it('should successfully complete when action finishes before timeout', async () => {
    const result = await udf.call({ testInput: 'quick' }, mockAgent);

    expect(result).toEqual({ testOutput: 'success' });
  });

  it('should throw PageActionTimeoutError when action exceeds timeout', async () => {
    const promise = udf.call({ testInput: 'timeout' }, mockAgent);

    // Advance timers incrementally to handle Promise.race properly
    jest.advanceTimersByTime(220);

    try {
      await promise;
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(PageActionTimeoutError);
    }
  });

  it('should save screenshot to memory after successful action', async () => {
    const result = await udf.call({ testInput: 'quick' }, mockAgent);
    expect(result).toEqual({ testOutput: 'success' });

    const currentStep = mockAgent.memory.steps[0] as ActionStep;
    expect(currentStep.observations).toHaveLength(1);
    expect(currentStep.observations[0]).toMatchObject({
      type: 'image',
      context:
        'screenshot after page action TestPageActionUdf on https://test.com',
      image: 'base64-encoded-screenshot-data',
    });
  });

  it('should save screenshot to memory after timeout', async () => {
    const promise = udf.call({ testInput: 'timeout' }, mockAgent);

    // Advance timers incrementally to handle Promise.race properly
    jest.advanceTimersByTime(220);

    try {
      await promise;
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(PageActionTimeoutError);
    }

    const currentStep = mockAgent.memory.steps[0] as ActionStep;
    expect(currentStep.observations).toHaveLength(1);
    expect(currentStep.observations[0]).toMatchObject({
      type: 'image',
      context:
        'screenshot after page action TestPageActionUdf on https://test.com\nPage action timed out after 200 ms. It is possible that the action succeeded but timed out on page load',
      image: 'base64-encoded-screenshot-data',
    });
  });
});
