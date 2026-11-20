/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Span as ISpan } from '@opentelemetry/api';
import {
  SpanStatusCode,
  context,
  propagation,
  SpanKind,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import type { ContextManager } from '@opentelemetry/api';
import {
  TracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
import {
  ATTR_CLIENT_ADDRESS,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as fs from 'fs';
import { HttpInstrumentation } from '../../src/http';
import { assertSpan } from '../utils/assertSpan';
import { DummyPropagation } from '../utils/DummyPropagation';
import { isWrapped } from '@opentelemetry/instrumentation';

const instrumentation = new HttpInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as http from 'http';
import type { OutgoingHttpHeaders } from 'http';
import * as https from 'https';
import { httpsRequest } from '../utils/httpsRequest';

const applyCustomAttributesOnSpanErrorMessage =
  'bad applyCustomAttributesOnSpan function';

let server: https.Server;
const serverPort = 32345;
const protocol = 'https';
const hostname = 'localhost';
const pathname = '/test';
const memoryExporter = new InMemorySpanExporter();
const provider = new TracerProvider({
  spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
});
instrumentation.setTracerProvider(provider);
const tracer = provider.getTracer('test-https');

// Responses that the local test server returns for specific paths. The
// server span of such requests is ignored so that only the client span of the
// request under test is recorded.
const mockRoutes = new Map<string, { status: number; body: string }>();

function doMock(path: string, httpCode: number, respBody: string) {
  mockRoutes.set(path, { status: httpCode, body: respBody });
}

export const customAttributeFunction = (span: ISpan): void => {
  span.setAttribute('span kind', SpanKind.CLIENT);
};

describe('HttpsInstrumentation', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    mockRoutes.clear();
    contextManager = new AsyncLocalStorageContextManager().enable();
    propagation.setGlobalPropagator(new DummyPropagation());
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    contextManager.disable();
    context.disable();
    propagation.disable();
  });

  describe('enable()', () => {
    describe('with bad instrumentation options', () => {
      beforeEach(() => {
        memoryExporter.reset();
      });

      before(() => {
        instrumentation.setConfig({
          ignoreIncomingRequestHook: _request => {
            throw new Error('bad ignoreIncomingRequestHook function');
          },
          ignoreOutgoingRequestHook: _request => {
            throw new Error('bad ignoreOutgoingRequestHook function');
          },
          applyCustomAttributesOnSpan: () => {
            throw new Error(applyCustomAttributesOnSpanErrorMessage);
          },
        });
        instrumentation.enable();
        server = https.createServer(
          {
            key: fs.readFileSync('test/fixtures/server-key.pem'),
            cert: fs.readFileSync('test/fixtures/server-cert.pem'),
          },
          (request, response) => {
            response.end('Test Server Response');
          }
        );

        server.listen(serverPort);
      });

      after(() => {
        server.close();
        instrumentation.disable();
      });

      it('should generate valid spans (client side and server side)', async () => {
        const result = await httpsRequest.get(
          `${protocol}://${hostname}:${serverPort}${pathname}`,
          {
            headers: {
              'user-agent': 'tester',
            },
          }
        );
        const spans = memoryExporter.getFinishedSpans();
        const [incomingSpan, outgoingSpan] = spans;
        const validations = {
          hostname,
          httpStatusCode: result.statusCode!,
          httpMethod: result.method!,
          pathname,
          resHeaders: result.resHeaders,
          reqHeaders: result.reqHeaders,
          component: 'https',
        };

        assert.strictEqual(spans.length, 2);
        assertSpan(incomingSpan, SpanKind.SERVER, validations);
        assertSpan(outgoingSpan, SpanKind.CLIENT, validations);
        assert.strictEqual(
          incomingSpan.attributes[ATTR_SERVER_PORT],
          serverPort
        );
        assert.strictEqual(
          outgoingSpan.attributes[ATTR_SERVER_PORT],
          serverPort
        );
      });
    });

    describe('with good instrumentation options', () => {
      beforeEach(() => {
        memoryExporter.reset();
      });

      before(() => {
        instrumentation.setConfig({
          ignoreIncomingRequestHook: request => {
            return (
              request.headers['user-agent']?.match('ignored-string') != null ||
              mockRoutes.has(request.url ?? '') ||
              request.url === '/no-response'
            );
          },
          ignoreOutgoingRequestHook: request => {
            const headers = request.headers as OutgoingHttpHeaders | undefined;
            if (headers?.['user-agent'] != null) {
              return `${headers['user-agent']}`.match('ignored-string') != null;
            }
            return false;
          },
          applyCustomAttributesOnSpan: customAttributeFunction,
        });
        instrumentation.enable();
        server = https.createServer(
          {
            key: fs.readFileSync('test/fixtures/server-key.pem'),
            cert: fs.readFileSync('test/fixtures/server-cert.pem'),
          },
          (request, response) => {
            const mock = mockRoutes.get(request.url ?? '');
            if (mock) {
              response.statusCode = mock.status;
              response.end(mock.body);
              return;
            }
            if (request.url === '/no-response') {
              // never respond.
              return;
            }
            if (request.url?.includes('/hang')) {
              // write response headers and hang the request.
              response.write('');
              return;
            }
            if (request.url?.includes('/ignored')) {
              tracer.startSpan('some-span').end();
            }
            response.end('Test Server Response');
          }
        );

        server.listen(serverPort);
      });

      after(() => {
        server.close();
        instrumentation.disable();
      });

      it(`${protocol} module should be patched`, () => {
        assert.strictEqual(isWrapped(https.Server.prototype.emit), true);
      });

      it('should generate valid spans (client side and server side)', async () => {
        const result = await httpsRequest.get(
          `${protocol}://${hostname}:${serverPort}${pathname}`,
          {
            headers: {
              'x-forwarded-for': '<client>, <proxy1>, <proxy2>',
              'user-agent': 'chrome',
            },
          }
        );
        const spans = memoryExporter.getFinishedSpans();
        const [incomingSpan, outgoingSpan] = spans;
        const validations = {
          hostname,
          httpStatusCode: result.statusCode!,
          httpMethod: result.method!,
          pathname,
          resHeaders: result.resHeaders,
          reqHeaders: result.reqHeaders,
          component: 'https',
        };

        assert.strictEqual(spans.length, 2);
        assert.strictEqual(
          incomingSpan.attributes[ATTR_CLIENT_ADDRESS],
          '<client>'
        );
        assert.strictEqual(
          incomingSpan.attributes[ATTR_SERVER_PORT],
          serverPort
        );
        assert.strictEqual(
          outgoingSpan.attributes[ATTR_SERVER_PORT],
          serverPort
        );

        [
          { span: incomingSpan, kind: SpanKind.SERVER },
          { span: outgoingSpan, kind: SpanKind.CLIENT },
        ].forEach(({ span, kind }) => {
          assert.strictEqual(
            span.attributes[ATTR_NETWORK_PROTOCOL_VERSION],
            '1.1'
          );
          assertSpan(span, kind, validations);
        });
      });

      const httpErrorCodes = [400, 401, 403, 404, 429, 501, 503, 504, 500, 505];

      for (let i = 0; i < httpErrorCodes.length; i++) {
        it(`should test span for GET requests with http error ${httpErrorCodes[i]}`, async () => {
          const testPath = '/outgoing/rootSpan/1';

          doMock(testPath, httpErrorCodes[i], httpErrorCodes[i].toString());

          const isReset = memoryExporter.getFinishedSpans().length === 0;
          assert.ok(isReset);

          const result = await httpsRequest.get(
            `${protocol}://${hostname}:${serverPort}${testPath}`
          );
          const spans = memoryExporter.getFinishedSpans();
          const reqSpan = spans[0];

          assert.strictEqual(result.data, httpErrorCodes[i].toString());
          assert.strictEqual(spans.length, 1);

          const validations = {
            hostname,
            httpStatusCode: result.statusCode!,
            httpMethod: 'GET',
            pathname: testPath,
            resHeaders: result.resHeaders,
            reqHeaders: result.reqHeaders,
            component: 'https',
          };

          assertSpan(reqSpan, SpanKind.CLIENT, validations);
        });
      }

      it('should create a child span for GET requests', async () => {
        const testPath = '/outgoing/rootSpan/childs/1';
        doMock(testPath, 200, 'Ok');
        const name = 'TestRootSpan';
        const span = tracer.startSpan(name);
        return context.with(trace.setSpan(context.active(), span), async () => {
          const result = await httpsRequest.get(
            `${protocol}://${hostname}:${serverPort}${testPath}`
          );
          span.end();
          const spans = memoryExporter.getFinishedSpans();
          const [reqSpan, localSpan] = spans;
          const validations = {
            hostname,
            httpStatusCode: result.statusCode!,
            httpMethod: 'GET',
            pathname: testPath,
            resHeaders: result.resHeaders,
            reqHeaders: result.reqHeaders,
            component: 'https',
          };

          assert.ok(localSpan.name.indexOf('TestRootSpan') >= 0);
          assert.strictEqual(spans.length, 2);
          assert.strictEqual(reqSpan.name, 'GET');
          assert.strictEqual(
            localSpan.spanContext().traceId,
            reqSpan.spanContext().traceId
          );
          assertSpan(reqSpan, SpanKind.CLIENT, validations);
          assert.notStrictEqual(
            localSpan.spanContext().spanId,
            reqSpan.spanContext().spanId
          );
        });
      });

      for (let i = 0; i < httpErrorCodes.length; i++) {
        it(`should test child spans for GET requests with http error ${httpErrorCodes[i]}`, async () => {
          const testPath = '/outgoing/rootSpan/childs/1';
          doMock(testPath, httpErrorCodes[i], httpErrorCodes[i].toString());
          const name = 'TestRootSpan';
          const span = tracer.startSpan(name);
          return context.with(
            trace.setSpan(context.active(), span),
            async () => {
              const result = await httpsRequest.get(
                `${protocol}://${hostname}:${serverPort}${testPath}`
              );
              span.end();
              const spans = memoryExporter.getFinishedSpans();
              const [reqSpan, localSpan] = spans;
              const validations = {
                hostname,
                httpStatusCode: result.statusCode!,
                httpMethod: 'GET',
                pathname: testPath,
                resHeaders: result.resHeaders,
                reqHeaders: result.reqHeaders,
                component: 'https',
              };

              assert.ok(localSpan.name.indexOf('TestRootSpan') >= 0);
              assert.strictEqual(spans.length, 2);
              assert.strictEqual(reqSpan.name, 'GET');
              assert.strictEqual(
                localSpan.spanContext().traceId,
                reqSpan.spanContext().traceId
              );
              assertSpan(reqSpan, SpanKind.CLIENT, validations);
              assert.notStrictEqual(
                localSpan.spanContext().spanId,
                reqSpan.spanContext().spanId
              );
            }
          );
        });
      }

      it('should create multiple child spans for GET requests', async () => {
        const testPath = '/outgoing/rootSpan/childs';
        const num = 5;
        doMock(testPath, 200, 'Ok');
        const name = 'TestRootSpan';
        const span = tracer.startSpan(name);
        await context.with(trace.setSpan(context.active(), span), async () => {
          for (let i = 0; i < num; i++) {
            await httpsRequest.get(
              `${protocol}://${hostname}:${serverPort}${testPath}`
            );
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans[i].name, 'GET');
            assert.strictEqual(
              span.spanContext().traceId,
              spans[i].spanContext().traceId
            );
          }
          span.end();
          const spans = memoryExporter.getFinishedSpans();
          // 5 child spans ended + 1 span (root)
          assert.strictEqual(spans.length, 6);
        });
      });

      it('should trace requests when ignore hook returns false', async () => {
        const testValue = 'ignored-string';

        await Promise.all([
          httpsRequest.get(`${protocol}://${hostname}:${serverPort}`, {
            headers: {
              'user-agent': testValue,
            },
          }),
        ]);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);
      });

      for (const arg of [{}, new Date()]) {
        it(`should be traceable and not throw exception in ${protocol} instrumentation when passing the following argument ${JSON.stringify(
          arg
        )}`, async () => {
          try {
            await httpsRequest.get(arg);
          } catch (error) {
            // the request has been made, but nothing listens on the default port.
            assert.strictEqual(error.code, 'ECONNREFUSED');
          }
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
        });
      }

      for (const arg of [true, 1, false, 0, '']) {
        it(`should not throw exception in https instrumentation when passing the following argument ${JSON.stringify(
          arg
        )}`, async () => {
          try {
            await httpsRequest.get(arg as any);
          } catch (error) {
            // The argument is passed on to the original method, which either
            // rejects the invalid URL or fails to connect to the default port.
            assert.ok(
              ['ERR_INVALID_URL', 'ECONNREFUSED'].includes(error.code),
              `unexpected error: ${error.code} ${error.message}`
            );
          }
          const spans = memoryExporter.getFinishedSpans();
          // for this arg with don't provide trace. We pass arg to original method (https.get)
          assert.strictEqual(spans.length, 0);
        });
      }

      it('should have 1 ended span when request throw on bad "options" object', () => {
        try {
          https.request({ protocol: 'telnet' });
        } catch (error) {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
        }
      });

      it('should have 1 ended span when response.end throw an exception', async () => {
        const testPath = '/outgoing/rootSpan/childs/1';
        doMock(testPath, 400, 'Not Ok');

        const promiseRequest = new Promise((resolve, reject) => {
          const req = https.request(
            `${protocol}://${hostname}:${serverPort}${testPath}`,
            (resp: http.IncomingMessage) => {
              let data = '';
              resp.on('data', chunk => {
                data += chunk;
              });
              resp.on('end', () => {
                reject(new Error(data));
              });
            }
          );
          return req.end();
        });

        try {
          await promiseRequest;
          assert.fail();
        } catch (error) {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
        }
      });

      it('should have 1 ended span when request throw on bad "options" object', () => {
        try {
          https.request({ protocol: 'telnet' });
          assert.fail();
        } catch (error) {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
        }
      });

      it('should have 2 ended spans when provided "options" are an object without a constructor', async () => {
        // Related issue: https://github.com/open-telemetry/opentelemetry-js/issues/2008
        const testPath = '/outgoing/test';
        const options = Object.create(null);
        options.hostname = hostname;
        options.port = serverPort;
        options.path = pathname;
        options.method = 'GET';

        doMock(testPath, 200, 'Ok');

        const promiseRequest = new Promise((resolve, _reject) => {
          const req = https.request(options, (resp: http.IncomingMessage) => {
            resp.on('data', () => {});
            resp.on('end', () => {
              resolve({});
            });
          });
          return req.end();
        });

        await promiseRequest;
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 2);
      });

      it('should have 1 ended span when response.end throw an exception', async () => {
        const testPath = '/outgoing/rootSpan/childs/1';
        doMock(testPath, 400, 'Not Ok');

        const promiseRequest = new Promise((resolve, reject) => {
          const req = https.request(
            `${protocol}://${hostname}:${serverPort}${testPath}`,
            (resp: http.IncomingMessage) => {
              let data = '';
              resp.on('data', chunk => {
                data += chunk;
              });
              resp.on('end', () => {
                reject(new Error(data));
              });
            }
          );
          return req.end();
        });

        try {
          await promiseRequest;
          assert.fail();
        } catch (error) {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
        }
      });

      it('should have 1 ended span when request is aborted', async () => {
        const promiseRequest = new Promise((resolve, reject) => {
          const req = https.request(
            `${protocol}://${hostname}:${serverPort}/no-response`,
            (resp: http.IncomingMessage) => {
              let data = '';
              resp.on('data', chunk => {
                data += chunk;
              });
              resp.on('end', () => {
                resolve(data);
              });
            }
          );
          setTimeout(() => req.destroy(), 10);
          // Instrumentation should not swallow error event.
          assert.strictEqual(req.listeners('error').length, 0);
          req.on('error', err => {
            reject(err);
          });
          return req.end();
        });

        await assert.rejects(promiseRequest, /Error: socket hang up/);
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.ok(Object.keys(span.attributes).length >= 5);
      });

      it('should have 1 ended span when request is aborted after receiving response', async () => {
        const promiseRequest = new Promise((resolve, reject) => {
          const req = https.request(
            `${protocol}://${hostname}:${serverPort}/hang`,
            (resp: http.IncomingMessage) => {
              resp.on('data', () => {});
              resp.on('end', () => resolve(undefined));
              resp.on('error', () => {});
              req.destroy(Error('request destroyed'));
            }
          );
          // Instrumentation should not swallow error event.
          assert.strictEqual(req.listeners('error').length, 0);
          req.on('error', err => {
            reject(err);
          });

          return req.end();
        });

        await assert.rejects(promiseRequest, /Error: request destroyed/);
        const spans = memoryExporter
          .getFinishedSpans()
          .filter(it => it.kind === SpanKind.CLIENT);
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.ok(Object.keys(span.attributes).length > 7);
      });

      it("should have 1 ended span when response is listened by using req.on('response')", done => {
        doMock('/not-found', 404, '');
        const req = https.request(
          `${protocol}://${hostname}:${serverPort}/not-found`
        );
        req.on('response', response => {
          response.on('data', () => {});
          response.on('end', () => {
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            assert.ok(Object.keys(span.attributes).length > 6);
            assert.strictEqual(
              span.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE],
              404
            );
            assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
            done();
          });
        });
        req.end();
      });

      it('should keep username and password in the request', async () => {
        await httpsRequest.get(
          `${protocol}://username:password@${hostname}:${serverPort}/login`
        );
      });

      it('should keep query in the request', async () => {
        await httpsRequest.get(
          `${protocol}://${hostname}:${serverPort}/withQuery?foo=bar`
        );
      });

      it('using an invalid url does throw from client but still creates a span', async () => {
        try {
          await httpsRequest.get(
            `${protocol}://instrumentation.test:string-as-port/`
          );
        } catch (e) {
          assert.match(e.message, /Invalid URL/);
        }

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
      });
    });

    describe('partially disable instrumentation', () => {
      beforeEach(() => {
        memoryExporter.reset();
      });

      afterEach(() => {
        server.close();
        instrumentation.disable();
      });

      it('allows to disable outgoing request instrumentation', () => {
        instrumentation.setConfig({
          disableOutgoingRequestInstrumentation: true,
        });
        instrumentation.enable();
        server = https.createServer(
          {
            key: fs.readFileSync('test/fixtures/server-key.pem'),
            cert: fs.readFileSync('test/fixtures/server-cert.pem'),
          },
          (request, response) => {
            response.end('Test Server Response');
          }
        );

        server.listen(serverPort);

        assert.strictEqual(isWrapped(http.Server.prototype.emit), true);
        assert.strictEqual(isWrapped(http.get), false);
        assert.strictEqual(isWrapped(http.request), false);
      });

      it('allows to disable incoming request instrumentation', () => {
        instrumentation.setConfig({
          disableIncomingRequestInstrumentation: true,
        });
        instrumentation.enable();
        server = https.createServer(
          {
            key: fs.readFileSync('test/fixtures/server-key.pem'),
            cert: fs.readFileSync('test/fixtures/server-cert.pem'),
          },
          (request, response) => {
            response.end('Test Server Response');
          }
        );

        server.listen(serverPort);

        assert.strictEqual(isWrapped(http.Server.prototype.emit), false);
        assert.strictEqual(isWrapped(http.get), true);
        assert.strictEqual(isWrapped(http.request), true);
      });
    });
  });
});
