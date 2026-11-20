/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Span } from '@opentelemetry/api';
import { context, SpanKind, propagation } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import * as assert from 'assert';
import { HttpInstrumentation } from '../../src/http';
import { assertSpan } from '../utils/assertSpan';
import { DummyPropagation } from '../utils/DummyPropagation';

const instrumentation = new HttpInstrumentation();
instrumentation.enable();
instrumentation.disable();

import type * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import type { AddressInfo } from 'net';
import * as superagent from 'superagent';
import * as axios from 'axios';

// The test server uses a self-signed certificate.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const memoryExporter = new InMemorySpanExporter();
const customAttributeFunction = (span: Span): void => {
  span.setAttribute('span kind', SpanKind.CLIENT);
};

describe('Packages', () => {
  beforeEach(() => {
    memoryExporter.reset();
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable()
    );
  });

  afterEach(() => {
    context.disable();
  });
  describe('get', () => {
    const provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
    });
    instrumentation.setTracerProvider(provider);
    beforeEach(() => {
      memoryExporter.reset();
    });

    let server: http.Server;
    let serverUrl: string;

    before(async () => {
      propagation.setGlobalPropagator(new DummyPropagation());
      instrumentation.setConfig({
        applyCustomAttributesOnSpan: customAttributeFunction,
        // Only the client spans are of interest here.
        ignoreIncomingRequestHook: () => true,
      });
      instrumentation.enable();

      server = https.createServer(
        {
          key: fs.readFileSync('test/fixtures/server-key.pem'),
          cert: fs.readFileSync('test/fixtures/server-cert.pem'),
        },
        (_request, response) => {
          response.setHeader('Content-Type', 'text/html');
          response.end('<html><body>Test Server Response</body></html>');
        }
      );
      await new Promise<void>(resolve =>
        server.listen(0, 'localhost', resolve)
      );
      serverUrl = `https://localhost:${(server.address() as AddressInfo).port}`;
    });

    after(() => {
      // back to normal
      server.close();
      propagation.disable();
    });

    let resHeaders: http.IncomingHttpHeaders;
    [
      { name: 'axios', httpPackage: axios }, //keep first
      { name: 'superagent', httpPackage: superagent },
    ].forEach(({ name, httpPackage }) => {
      it(`should create a span for GET requests and add propagation headers by using ${name} package`, async () => {
        const urlparsed = new URL(
          `${serverUrl}/search?q=axios&oq=axios&aqs=chrome.0.69i59l2j0l3j69i60.811j0j7&sourceid=chrome&ie=UTF-8`
        );
        const result = await httpPackage.get(urlparsed.href);
        if (!resHeaders) {
          const res = result as axios.AxiosResponse<unknown>;
          resHeaders = res.headers as any;
        }
        const spans = memoryExporter.getFinishedSpans();
        const span = spans[0];
        const validations = {
          hostname: urlparsed.hostname,
          httpStatusCode: 200,
          httpMethod: 'GET',
          pathname: urlparsed.pathname,
          path: urlparsed.pathname + urlparsed.search,
          resHeaders,
          component: 'https',
        };

        assert.strictEqual(spans.length, 1);
        assert.strictEqual(span.name, 'GET');

        switch (name) {
          case 'axios':
            assert.ok(
              result.request.getHeader(DummyPropagation.TRACE_CONTEXT_KEY)
            );
            assert.ok(
              result.request.getHeader(DummyPropagation.SPAN_CONTEXT_KEY)
            );
            break;
          case 'superagent':
            break;
          default:
            break;
        }
        assert.strictEqual(span.attributes['span kind'], SpanKind.CLIENT);
        assertSpan(span, SpanKind.CLIENT, validations);
      });
    });
  });
});
