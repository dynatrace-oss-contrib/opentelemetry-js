/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Example demonstrating how to use attach/detach with Node.js TracingChannel API
 *
 * TracingChannel provides start/end/asyncStart/asyncEnd/error events for tracing operations.
 * Before attach/detach, there was no good way to set context imperatively in these
 * synchronous event handlers.
 *
 * Run with: node examples/tracing-channel-example.js
 * Requires: Node.js >= 19.9.0
 */

const { tracingChannel } = require('diagnostics_channel');
const { AsyncLocalStorageContextManager } = require('../build/src');
const { createContextKey } = require('@opentelemetry/api');

const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();

// Create context keys
const spanIdKey = createContextKey('spanId');
const operationKey = createContextKey('operation');

// Create a tracing channel for database operations
const dbChannel = tracingChannel('db.query');

// Map to store tokens for cleanup
const tokens = new WeakMap();

// Subscribe to the channel's events
dbChannel.subscribe({
  start(message) {
    console.log(`[START] ${message.operation}`);

    // Create a context with operation details, preserving any existing context
    const operationContext = contextManager.active()
      .setValue(spanIdKey, message.spanId)
      .setValue(operationKey, message.operation);

    // Attach the context - it will propagate to all async operations
    const token = contextManager.attach(operationContext);

    // Store the token so we can detach later
    tokens.set(message, token);
  },

  end(message) {
    console.log(`[END] ${message.operation}`);

    // Retrieve and detach the token to restore previous context
    const token = tokens.get(message);
    if (token) {
      contextManager.detach(token);
      tokens.delete(message);
    }
  },

  asyncStart(message) {
    const activeContext = contextManager.active();
    const spanId = activeContext.getValue(spanIdKey);
    console.log(`[ASYNC_START] Active context: spanId=${spanId}`);
  },

  asyncEnd(message) {
    console.log(`[ASYNC_END] ${message.operation}`);
  },
});

// Simulate a database query function
async function queryDatabase(sql) {
  const message = {
    operation: 'SELECT',
    spanId: `span-${Math.random().toString(36).slice(2, 9)}`,
    sql,
  };

  return dbChannel.tracePromise(() => {
    return new Promise(resolve => {
      setImmediate(() => {
        console.log(`  Executing query: ${sql}`);
        const activeContext = contextManager.active();
        console.log(`  Active spanId: ${activeContext.getValue(spanIdKey)}`);
        resolve({ rows: [] });
      });
    });
  }, message);
}

// Example usage
async function main() {
  console.log('=== TracingChannel + attach/detach Example ===\n');

  await queryDatabase('SELECT * FROM users WHERE id = 1');
  console.log();

  await queryDatabase('SELECT * FROM orders WHERE user_id = 1');
  console.log();

  console.log('✓ Context was properly managed across async operations!');
  contextManager.disable();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
