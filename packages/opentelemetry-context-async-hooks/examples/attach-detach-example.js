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
 * Example demonstrating attach() and detach() methods
 * Run with: node examples/attach-detach-example.js
 */

const { AsyncLocalStorageContextManager } = require('../build/src');
const { ROOT_CONTEXT, createContextKey } = require('@opentelemetry/api');

// Create a context manager and enable it
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();

// Create a context key for demonstration
const userIdKey = createContextKey('userId');

console.log('=== Attach/Detach Example ===\n');

// Initial state
console.log('1. Initial context:', contextManager.active() === ROOT_CONTEXT ? 'ROOT_CONTEXT' : 'other');

// Create contexts
const userContext1 = ROOT_CONTEXT.setValue(userIdKey, 'user-123');
const userContext2 = ROOT_CONTEXT.setValue(userIdKey, 'user-456');

// Attach first context
console.log('\n2. Attaching user-123 context...');
const token1 = contextManager.attach(userContext1);
console.log('   Active user:', contextManager.active().getValue(userIdKey));

// Attach second context (nested)
console.log('\n3. Attaching user-456 context (nested)...');
const token2 = contextManager.attach(userContext2);
console.log('   Active user:', contextManager.active().getValue(userIdKey));

// Detach second context
console.log('\n4. Detaching user-456 context...');
contextManager.detach(token2);
console.log('   Active user:', contextManager.active().getValue(userIdKey));

// Detach first context
console.log('\n5. Detaching user-123 context...');
contextManager.detach(token1);
console.log('   Back to:', contextManager.active() === ROOT_CONTEXT ? 'ROOT_CONTEXT' : 'other');

// Demonstrate with async operations
console.log('\n=== Async Operations Example ===\n');
const asyncContext = ROOT_CONTEXT.setValue(userIdKey, 'async-user');
const asyncToken = contextManager.attach(asyncContext);

console.log('6. Before async operation:', contextManager.active().getValue(userIdKey));

setTimeout(() => {
  console.log('7. Inside setTimeout:', contextManager.active().getValue(userIdKey));

  Promise.resolve().then(() => {
    console.log('8. Inside Promise:', contextManager.active().getValue(userIdKey));

    // Clean up
    contextManager.detach(asyncToken);
    console.log('9. After detach:', contextManager.active() === ROOT_CONTEXT ? 'ROOT_CONTEXT' : 'other');

    contextManager.disable();
    console.log('\n✓ Example completed successfully!');
  });
}, 10);

