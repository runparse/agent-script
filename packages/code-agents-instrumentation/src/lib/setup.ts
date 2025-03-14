/* eslint-disable no-console */
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  // ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { AgentsInstrumentation } from './agentsInstrumentation';

export function setup(
  options: { omitImageData: boolean } = { omitImageData: true },
) {
  console.log(options);
  // For troubleshooting, set the log level to DiagLogLevel.DEBUG
  // diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  const provider = new NodeTracerProvider();

  // provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.addSpanProcessor(
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:6006/v1/traces',
      }),
    ),
  );
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new AgentsInstrumentation(
        { omitImageData: options.omitImageData },
        { base64ImageMaxLength: 256 * 1024 },
      ),
    ],
  });

  console.log('👀 OpenInference initialized');
}
