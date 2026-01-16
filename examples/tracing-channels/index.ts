import { tracingChannel } from 'diagnostics_channel';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('db-tracing-channel-tracer');

const dbChannel = tracingChannel('db.query');

// Simulate a database query using TracingChannel
async function queryDatabase(operation: string, sql: string): Promise<any> {
  const message = { operation, sql };

  return dbChannel.tracePromise(async () => {
    // Simulate async database work
    await new Promise(resolve => setTimeout(resolve, 10));
    console.log(`Executed: ${sql}`);

    // For INSERT operations, simulate an additional nested span to show context propagation
    if (operation === 'INSERT') {
      await tracer.startActiveSpan('db.query.INSERT.validate', async (validateSpan) => {
        console.log('  [Nested Span] Validating INSERT operation...');
        validateSpan.setAttribute('validation.result', 'success');
        await new Promise(resolve => setTimeout(resolve, 5));
        validateSpan.end();
      });
    }

    return { rows: [] };
  }, message);
}

// Main application
await tracer.startActiveSpan('main', async (mainSpan) => {
  console.log('Starting application...\n');

  // These queries will automatically create child spans via TracingChannel
  await queryDatabase('SELECT', 'SELECT * FROM users WHERE id = 1');
  await queryDatabase('SELECT', 'SELECT * FROM orders WHERE user_id = 1');
  await queryDatabase('INSERT', 'INSERT INTO logs (message) VALUES (\'test\')');

  console.log('\nApplication complete!');
  mainSpan.end();
});
