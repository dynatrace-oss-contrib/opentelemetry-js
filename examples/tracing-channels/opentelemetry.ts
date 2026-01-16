import api from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { tracingChannel } from 'diagnostics_channel';

const { trace, context } = api;
import type { Span } from '@opentelemetry/api';

const sdk = new NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter()),
    new SimpleSpanProcessor(new OTLPTraceExporter())
  ],
  metricReaders: [],
  logRecordProcessors: []
});

sdk.start();

// pretend to be a tracing-channel based instrumentation.
const tracer = trace.getTracer('db-tracing-channel-tracer');
const OTEL_DB_TRACING_CONTEXT = Symbol('otel-db-tracing-context');
//const contextManager = context['_getContextManager']();

// Create a TracingChannel for database operations
const dbChannel = tracingChannel('db.query');

function endAndDetach(message: any) {
  // End the span
  const span = message[OTEL_DB_TRACING_CONTEXT].span;
  if (span) {
    span.end();
  }

  // Restore previous context
  const token =
    message[OTEL_DB_TRACING_CONTEXT].token;
  if (token) {
    context.detach?.(token);
  }
}

// Subscribe to TracingChannel events to create spans
dbChannel.subscribe({
  start(message: any) {
    console.log(`[TracingChannel] Starting span for: ${message.operation} - ${message.sql}`);

    // Start a new span for this operation - do whatever is needed to generate the span
    const span = tracer.startSpan(`db.query.${message.operation}`, {
      attributes: {
        'db.system': 'postgresql',
        'db.statement': message.sql,
      }
    });

    // Create context with the new span and attach it
    // This uses the active context to preserve parent spans
    const spanContext = trace.setSpan(context.active(), span);
    const token = context.attach?.(spanContext);

    // Store both on context for later cleanup
    message[OTEL_DB_TRACING_CONTEXT] = {
      token: token,
      span: span
    };
  },

  end(message: any) {
    console.log(`[TracingChannel] Ending span for: ${message.operation}`);
    endAndDetach(message);
  },

  error(message: any, error: Error) {
    // Record the error on the span
    const span = message[OTEL_DB_TRACING_CONTEXT].span;
    if (span) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message }); // SpanStatusCode.ERROR = 2
    }

    endAndDetach(message);
  }
});

async function shutdown(): Promise<void> {
  try {
    await sdk.shutdown();
    api.diag.debug('OpenTelemetry SDK terminated');
  } catch (error) {
    api.diag.error('Error terminating OpenTelemetry SDK', error);
  }
}

// Gracefully shutdown SDK if a SIGTERM is received
process.on('SIGTERM', shutdown);
// Gracefully shutdown SDK if Node.js is exiting normally
process.once('beforeExit', shutdown);
