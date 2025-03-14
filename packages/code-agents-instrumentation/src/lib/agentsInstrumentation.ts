import {
  InstrumentationBase,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import { context, trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import {
  SemanticConventions,
  OpenInferenceSpanKind,
  MimeType,
  LLMProvider,
  LLMSystem,
} from '@arizeai/openinference-semantic-conventions';

import {
  MultiStepAgent,
  CodeAgent,
  TsCodeAgent,
  ChatModel,
  IChatMessage,
  ActionStep,
  IChatResponseMetadata,
} from '@runparse/code-agents';
import { CompletionNonStreaming } from 'token.js/dist/chat';
import { getLLMInputMessagesAttributes } from './utils';

import { OITracer, TraceConfigOptions } from '@arizeai/openinference-core';

const COMPONENT = '@runparse/code-agents-instrumentation';

export interface AgentsInstrumentationConfig extends InstrumentationConfig {
  omitImageData: boolean;
}

export class AgentsInstrumentation extends InstrumentationBase<AgentsInstrumentationConfig> {
  private oiTracer: OITracer;

  constructor(
    config: AgentsInstrumentationConfig = { omitImageData: true },
    traceConfig?: TraceConfigOptions,
  ) {
    super('@runparse/code-agents-instrumentation', '1.0.0', config);
    this.oiTracer = new OITracer({ tracer: this.tracer, traceConfig });
  }

  protected init(): void {
    // Instrument MultiStepAgent methodSemanticAttributess
    this._diag.debug('Patching MultiStepAgent methods');
    this.patchMultiStepAgent();

    // Instrument CodeAgent methods
    this._diag.debug('Patching CodeAgent methods');
    this.patchCodeAgent();

    // Instrument TsCodeAgent methods
    this._diag.debug('Patching TsCodeAgent methods');
    this.patchTsCodeAgent();

    // Instrument ChatModel methods
    this._diag.debug('Patching ChatModel methods');
    this.patchChatModel({ omitImageData: this._config.omitImageData });
  }

  private patchCodeAgent(): void {
    this._wrap(
      CodeAgent.prototype,
      'step',
      (original) =>
        async function patchedStep(
          this: CodeAgent<any>,
          memoryStep: ActionStep,
        ) {
          const span = trace
            .getTracer(COMPONENT)
            .startSpan(`Step ${memoryStep.stepNumber}`, {
              attributes: {
                [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
                  OpenInferenceSpanKind.CHAIN,
                [SemanticConventions.INPUT_VALUE]: JSON.stringify(memoryStep),
              },
            });

          return context.with(
            trace.setSpan(context.active(), span),
            async () => {
              try {
                const result = await original.call(this, memoryStep);
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute(
                  SemanticConventions.OUTPUT_VALUE,
                  memoryStep.observations || 'No observations',
                );
                return result;
              } catch (error: any) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.recordException(error);
                throw error;
              } finally {
                span.end();
              }
            },
          );
        },
    );
  }

  private patchTsCodeAgent(): void {
    this._wrap(
      TsCodeAgent.prototype,
      'step',
      (original) =>
        async function patchedStep(
          this: TsCodeAgent<any>,
          memoryStep: ActionStep,
        ) {
          const span = trace
            .getTracer(COMPONENT)
            .startSpan(`Step ${memoryStep.stepNumber}`, {
              attributes: {
                [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
                  OpenInferenceSpanKind.CHAIN,
                [SemanticConventions.INPUT_VALUE]: JSON.stringify(memoryStep),
              },
            });

          return context.with(
            trace.setSpan(context.active(), span),
            async () => {
              try {
                const result = await original.call(this, memoryStep);
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute(
                  SemanticConventions.OUTPUT_VALUE,
                  memoryStep.observations || 'No observations',
                );
                return result;
              } catch (error: any) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.recordException(error);
                throw error;
              } finally {
                span.end();
              }
            },
          );
        },
    );
  }

  private patchMultiStepAgent(): void {
    this._wrap(
      MultiStepAgent.prototype,
      'run',
      (original) =>
        async function patchedRun(
          this: MultiStepAgent<any>,
          task: string,
          options: any,
        ) {
          const span = trace.getTracer(COMPONENT).startSpan(`Agent Run`, {
            attributes: {
              [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
                OpenInferenceSpanKind.AGENT,
              [SemanticConventions.INPUT_VALUE]: JSON.stringify({
                task,
                options,
              }),
            },
          });

          return context.with(
            trace.setSpan(context.active(), span),
            async () => {
              try {
                const result = await original.call(this, task, options);
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute(
                  SemanticConventions.OUTPUT_VALUE,
                  JSON.stringify(result),
                );
                return result;
              } catch (error: any) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.recordException(error);
                throw error;
              } finally {
                span.end();
              }
            },
          );
        },
    );

    this._wrap(
      MultiStepAgent.prototype,
      'executeToolCall',
      (original) =>
        async function patchedExecuteToolCall(
          this: MultiStepAgent<any>,
          toolName: string,
          input: any,
        ) {
          const span = trace.getTracer(COMPONENT).startSpan('Tool Call', {
            attributes: {
              [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
                OpenInferenceSpanKind.TOOL,
              [SemanticConventions.INPUT_VALUE]: JSON.stringify({
                toolName,
                input,
              }),
            },
          });

          return context.with(
            trace.setSpan(context.active(), span),
            async () => {
              try {
                const result = await original.call(this, toolName, input);
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute(
                  SemanticConventions.OUTPUT_VALUE,
                  JSON.stringify(result),
                );
                return result;
              } catch (error: any) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.recordException(error);
                throw error;
              } finally {
                span.end();
              }
            },
          );
        },
    );
  }

  private patchChatModel({ omitImageData }: { omitImageData: boolean }): void {
    const instrumentation = this;
    this._wrap(
      ChatModel.prototype,
      'chatCompletion',
      (original) =>
        async function patchedChatCompletion(
          this: ChatModel,
          request: CompletionNonStreaming<any>,
        ) {
          const attributes = getLLMInputMessagesAttributes(request);
          const { messages: _messages, ...invocationParameters } = request;
          const span = instrumentation.oiTracer.startSpan('Model', {
            kind: SpanKind.INTERNAL,
            attributes: {
              [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
                OpenInferenceSpanKind.LLM,
              [SemanticConventions.LLM_MODEL_NAME]: request.model || 'gpt-4o',
              [SemanticConventions.INPUT_VALUE]: JSON.stringify(request),
              [SemanticConventions.INPUT_MIME_TYPE]: MimeType.JSON,
              [SemanticConventions.LLM_INVOCATION_PARAMETERS]:
                JSON.stringify(invocationParameters),
              [SemanticConventions.LLM_SYSTEM]: LLMSystem.OPENAI,
              [SemanticConventions.LLM_PROVIDER]: LLMProvider.OPENAI,
              ...attributes,
            },
          });

          return context.with(
            trace.setSpan(context.active(), span),
            async () => {
              try {
                const result: {
                  message: IChatMessage;
                  metadata: IChatResponseMetadata;
                } = await original.call(this, request);
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute(
                  SemanticConventions.LLM_TOKEN_COUNT_PROMPT,
                  result.metadata.usage.promptTokens,
                );
                span.setAttribute(
                  SemanticConventions.LLM_TOKEN_COUNT_COMPLETION,
                  result.metadata.usage.completionTokens,
                );
                span.setAttribute(
                  SemanticConventions.LLM_TOKEN_COUNT_TOTAL,
                  result.metadata.usage.totalTokens,
                );
                span.setAttribute(
                  `${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_ROLE}`,
                  result.message.role,
                );
                span.setAttribute(
                  `${SemanticConventions.LLM_OUTPUT_MESSAGES}.0.${SemanticConventions.MESSAGE_CONTENT}`,
                  result.message.content,
                );
                return result;
              } catch (error: any) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.recordException(error);
                throw error;
              } finally {
                span.end();
              }
            },
          );
        },
    );
  }

  override enable() {
    this._diag.debug('Enabling instrumentation');
    super.enable();
  }

  override disable() {
    this._diag.debug('Disabling instrumentation');
    super.disable();
  }
}
