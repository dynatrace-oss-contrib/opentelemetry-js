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
import { GrpcInstrumentation } from '../src';
const instrumentation = new GrpcInstrumentation();
instrumentation.enable();
instrumentation.disable();

import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import * as grpc from '@grpc/grpc-js';
import { GrpcTesterClient } from './proto/ts/fixtures/grpc-test.client';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { promisify } from 'util';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as assert from 'assert';
import {
  context,
  ContextManager,
  propagation,
  SpanKind,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { assertPropagation, assertSpan } from './utils/assertionUtils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

interface TestRequestResponse {
  num: number;
}

function createClient() {
  return new GrpcTesterClient(
    new GrpcTransport({
      host: 'localhost:3333',
      channelCredentials: grpc.credentials.createInsecure(),
    })
  );
}
const memoryExporter = new InMemorySpanExporter();
const PROTO_PATH = path.resolve(__dirname, './fixtures/grpc-test.proto');

const options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

describe('#grpc-protobuf', () => {
  it('bla', () => {});

  describe('enable()', () => {
    let client: GrpcTesterClient;
    let server: grpc.Server;
    const provider = new NodeTracerProvider();
    let contextManager: ContextManager;
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    beforeEach(() => {
      memoryExporter.reset();

      contextManager = new AsyncHooksContextManager().enable();
      context.setGlobalContextManager(contextManager);
    });

    before(async () => {
      propagation.setGlobalPropagator(new W3CTraceContextPropagator());
      instrumentation.setTracerProvider(provider);
      instrumentation.enable();

      const packageDefinition = await protoLoader.load(PROTO_PATH, options);
      const proto = grpc.loadPackageDefinition(packageDefinition).pkg_test;

      server = await startServer(proto);
      client = createClient();
    });

    afterEach(() => {
      context.disable();
    });

    after(done => {
      server.tryShutdown(() => {
        instrumentation.disable();
        done();
      });
    });

    it('unaryMethod', async () => {
      const finishedCall = await client.unaryMethod({
        num: MAX_ERROR_STATUS + 1,
      });
      assert.strictEqual(finishedCall.response.num, MAX_ERROR_STATUS + 1);
      const spans = memoryExporter.getFinishedSpans();
      const clientSpan = spans[1];
      const serverSpan = spans[0];

      const validations = {
        name: 'grpc.pkg_test.GrpcTester/UnaryMethod',
        netPeerName: 'localhost',
        status: grpc.status.OK,
        netPeerPort: 3333,
      };

      assert.strictEqual(
        clientSpan.spanContext().traceId,
        serverSpan.spanContext().traceId
      );
      assertPropagation(serverSpan, clientSpan);

      assertSpan('grpc', serverSpan, SpanKind.SERVER, validations);
      assertSpan('grpc', clientSpan, SpanKind.CLIENT, validations);
      assert.strictEqual(
        clientSpan.attributes[SemanticAttributes.RPC_METHOD],
        'UnaryMethod'
      );
      assert.strictEqual(
        clientSpan.attributes[SemanticAttributes.RPC_SERVICE],
        'pkg_test.GrpcTester'
      );
    });

    it('clientStreamMethod', async () => {
      const call = client.clientStreamMethod({
        num: MAX_ERROR_STATUS + 1,
      });

      await call.requests.send({ num: MAX_ERROR_STATUS + 1 });
      await call.requests.send({ num: MAX_ERROR_STATUS + 1 });
      await call.requests.send({ num: MAX_ERROR_STATUS + 1 });
      await call.requests.complete();

      const finshedCall = await call.response;

      assert.strictEqual(finshedCall.num, (MAX_ERROR_STATUS + 1) * 3);
      const spans = memoryExporter.getFinishedSpans();
      const clientSpan = spans[1];
      const serverSpan = spans[0];

      const validations = {
        name: 'grpc.pkg_test.GrpcTester/UnaryMethod',
        netPeerName: 'localhost',
        status: grpc.status.OK,
        netPeerPort: 3333,
      };

      assert.strictEqual(
        clientSpan.spanContext().traceId,
        serverSpan.spanContext().traceId
      );
      assertPropagation(serverSpan, clientSpan);

      assertSpan('grpc', serverSpan, SpanKind.SERVER, validations);
      assertSpan('grpc', clientSpan, SpanKind.CLIENT, validations);
      assert.strictEqual(
        clientSpan.attributes[SemanticAttributes.RPC_METHOD],
        'UnaryMethod'
      );
      assert.strictEqual(
        clientSpan.attributes[SemanticAttributes.RPC_SERVICE],
        'pkg_test.GrpcTester'
      );
    });
  });
});

const MAX_ERROR_STATUS = grpc.status.UNAUTHENTICATED;

const replicate = (request: TestRequestResponse) => {
  const result: TestRequestResponse[] = [];
  for (let i = 0; i < request.num; i++) {
    result.push(request);
  }
  return result;
};

async function startServer(proto: any) {
  const server = new grpc.Server();

  function getError(msg: string, code: number): grpc.ServiceError | null {
    const err: grpc.ServiceError = {
      ...new Error(msg),
      name: msg,
      message: msg,
      code,
      details: msg,
    } as grpc.ServiceError;
    return err;
  }

  server.addService(proto.GrpcTester.service, {
    // An error is emitted every time
    // request.num <= MAX_ERROR_STATUS = (status.UNAUTHENTICATED)
    // in those cases, erro.code = request.num

    // This method returns the request
    unaryMethodWithMetadata(
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.requestCallback<any>
    ) {
      const serverMetadata: any = new grpc.Metadata();
      serverMetadata.add('server_metadata_key', 'server_metadata_value');

      call.sendMetadata(serverMetadata);

      call.request.num <= MAX_ERROR_STATUS
        ? callback(
            getError(
              'Unary Method with Metadata Error',
              call.request.num
            ) as grpc.ServiceError
          )
        : callback(null, { num: call.request.num });
    },

    // This method returns the request
    unaryMethod(
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.requestCallback<any>
    ) {
      if (call.request.num <= MAX_ERROR_STATUS) {
        callback(
          getError('Unary Method Error', call.request.num) as grpc.ServiceError
        );
      } else {
        callback(null, { num: call.request.num });
      }
    },

    // This method returns the request
    camelCaseMethod(
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.requestCallback<any>
    ) {
      call.request.num <= MAX_ERROR_STATUS
        ? callback(
            getError(
              'Unary Method Error',
              call.request.num
            ) as grpc.ServiceError
          )
        : callback(null, { num: call.request.num });
    },

    // This method sums the requests
    clientStreamMethod(
      call: grpc.ServerReadableStream<any, any>,
      callback: grpc.requestCallback<any>
    ) {
      let sum = 0;
      let hasError = false;
      let code = grpc.status.OK;
      call.on('data', (data: TestRequestResponse) => {
        sum += data.num;
        if (data.num <= MAX_ERROR_STATUS) {
          hasError = true;
          code = data.num;
        }
      });
      call.on('end', () => {
        hasError
          ? callback(getError('Client Stream Method Error', code) as any)
          : callback(null, { num: sum });
      });
    },

    // This method returns an array that replicates the request, request.num of
    // times
    serverStreamMethod: (call: grpc.ServerWritableStream<any, any>) => {
      const result = replicate(call.request);

      if (call.request.num <= MAX_ERROR_STATUS) {
        call.emit(
          'error',
          getError('Server Stream Method Error', call.request.num)
        );
      } else {
        result.forEach(element => {
          call.write(element);
        });
      }
      call.end();
    },

    // This method returns the request
    bidiStreamMethod: (call: grpc.ServerDuplexStream<any, any>) => {
      call.on('data', (data: TestRequestResponse) => {
        if (data.num <= MAX_ERROR_STATUS) {
          call.emit('error', getError('Server Stream Method Error', data.num));
        } else {
          call.write(data);
        }
      });
      call.on('end', () => {
        call.end();
      });
    },
  });
  const bindAwait = promisify(server.bindAsync);
  await bindAwait.call(
    server,
    'localhost:' + 3333,
    grpc.ServerCredentials.createInsecure() as grpc.ServerCredentials
  );
  server.start();
  return server;
}
