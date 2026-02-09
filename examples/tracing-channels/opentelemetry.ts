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

// Create a TracingChannel for database operations
const dbChannel = tracingChannel('db.query');

function getSpanFromMessage(message: any): Span | undefined {
  return message[OTEL_DB_TRACING_CONTEXT]?.span;
}

function getContextTokenFromMessage(message: any) {
  return  message[OTEL_DB_TRACING_CONTEXT]?.token;
}

function getAsyncContextTokenFromMessage(message: any) {
  return  message[OTEL_DB_TRACING_CONTEXT]?.asyncToken;
}

function getContextFromMessage(message: any) {
  return message[OTEL_DB_TRACING_CONTEXT]?.context;
}

function ensSpanIfSync(message: any) {
  const syncToken = getContextTokenFromMessage(message);
  if (syncToken) {
    getSpanFromMessage(message)?.end();
  }
}

function endAndDetachSync(message: any) {
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
    const span = getSpanFromMessage(message) ?? tracer.startSpan(`db.query.${message.operation}`, {
      attributes: {
        'db.system': 'postgresql',
        'db.statement': message.sql,
      }
    });

    // Create context with the new span and attach it
    // This uses the active context to preserve parent spans
    const spanContext = trace.setSpan(getContextFromMessage(message) ?? context.active(), span);
    const token = context.attach?.(spanContext);

    // Store both on context for later cleanup
    message[OTEL_DB_TRACING_CONTEXT] = {
      token: token,
      span: span,
      context: spanContext
    };
  },

  asyncStart(message: any) {
    console.log(`[TracingChannel] Starting span (async) for: ${message.operation} - ${message.sql}`);

    // Start a new span for this operation - do whatever is needed to generate the span
    const span = getSpanFromMessage(message) ?? tracer.startSpan(`db.query.${message.operation}`, {
      attributes: {
        'db.system': 'postgresql',
        'db.statement': message.sql,
      }
    });

    // Create context with the new span and attach it
    // This uses the active context to preserve parent spans
    const spanContext = trace.setSpan(getContextFromMessage(message) ?? context.active(), span);
    const asyncToken = context.attach?.(spanContext);

    // Store both on context for later cleanup
    const messageContext = message[OTEL_DB_TRACING_CONTEXT] ?? {};
    messageContext.asyncToken = asyncToken;
  },

  end(message: any) {
    // Restore previous context
    const token = getContextTokenFromMessage(message);
    if(token) {
      context.detach?.(token);
    }
  },

  asyncEnd(message: any) {
    console.log(`[TracingChannel] Ending span for: ${message.operation}`);
    // end the span
    getSpanFromMessage(message)?.end();
    // Restore previous context
    const token = getAsyncContextTokenFromMessage(message);
    if (token) {
      context.detach?.(token);
    }
  },


  error(message: any, error: Error) {
    // Record the error on the span
    const span = message[OTEL_DB_TRACING_CONTEXT].span;
    if (span) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message }); // SpanStatusCode.ERROR = 2
    }

    // Restore previous context
    const token = getContextTokenFromMessage(message);
    if (token) {
      context.detach?.(token);
    }
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
