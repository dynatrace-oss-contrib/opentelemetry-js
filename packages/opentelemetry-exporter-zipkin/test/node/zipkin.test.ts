/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import * as http from 'http';
import * as https from 'https';
import type { AddressInfo } from 'net';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import type { ExportResult } from '@opentelemetry/core';
import { hrTimeToMicroseconds, ExportResultCode } from '@opentelemetry/core';
import * as api from '@opentelemetry/api';
import {
  emptyResource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { ZipkinExporter } from '../../src';
import type * as zipkinTypes from '../../src/types';
import { TraceFlags } from '@opentelemetry/api';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const MICROS_PER_SECS = 1e6;

function getReadableSpan() {
  const startTime = 1566156729709;
  const duration = 2000;
  const readableSpan: ReadableSpan = {
    name: 'my-span',
    kind: api.SpanKind.INTERNAL,
    spanContext: () => {
      return {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
      };
    },
    startTime: [startTime, 0],
    endTime: [startTime + duration, 0],
    ended: true,
    duration: [duration, 0],
    status: {
      code: api.SpanStatusCode.OK,
    },
    attributes: {},
    links: [],
    events: [],
    resource: emptyResource(),
    instrumentationScope: { name: 'default', version: '0.0.1' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  };
  return readableSpan;
}

interface ReceivedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: any;
}

function exportSpans(
  exporter: ZipkinExporter,
  spans: ReadableSpan[]
): Promise<ExportResult> {
  return new Promise(resolve => exporter.export(spans, resolve));
}

describe('Zipkin Exporter - node', () => {
  let server: http.Server;
  let url: string;
  let received: ReceivedRequest[];
  let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeEach(async () => {
    received = [];
    respond = (_req, res) => {
      res.writeHead(202).end();
    };
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', chunk => {
        raw += chunk;
      });
      req.on('end', () => {
        received.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: JSON.parse(raw),
        });
        respond(req, res);
      });
    });
    await new Promise<void>(resolve => server.listen(0, 'localhost', resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}/api/v2/spans`;
  });

  afterEach(async () => {
    sinon.restore();
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  });

  describe('constructor', () => {
    it('should construct an exporter', () => {
      const exporter = new ZipkinExporter({ serviceName: 'my-service' });
      assert.ok(typeof exporter.export === 'function');
      assert.ok(typeof exporter.shutdown === 'function');
    });
    it('should construct an exporter with url', () => {
      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        url: 'http://localhost',
      });
      assert.ok(typeof exporter.export === 'function');
      assert.ok(typeof exporter.shutdown === 'function');
    });
    it('should construct an exporter with logger', () => {
      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
      });
      assert.ok(typeof exporter.export === 'function');
      assert.ok(typeof exporter.shutdown === 'function');
    });
    it('should construct an exporter with statusCodeTagName', () => {
      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        statusCodeTagName: 'code',
      });
      assert.ok(typeof exporter.export === 'function');
      assert.ok(typeof exporter.shutdown === 'function');
    });
    it('should construct an exporter with statusDescriptionTagName', () => {
      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        statusDescriptionTagName: 'description',
      });
      assert.ok(typeof exporter.export === 'function');
      assert.ok(typeof exporter.shutdown === 'function');
    });
  });

  describe('export', () => {
    it('should skip send with empty array', () => {
      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
      });

      exporter.export([], (result: ExportResult) => {
        assert.strictEqual(result.code, ExportResultCode.SUCCESS);
      });
    });

    it('should send spans to Zipkin backend and return with Success', async () => {
      const parentSpanId = '5c1c63257de34c67';
      const startTime = 1566156729709;
      const duration = 2000;

      const span1: ReadableSpan = {
        name: 'my-span',
        kind: api.SpanKind.INTERNAL,
        parentSpanContext: {
          spanId: parentSpanId,
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          traceFlags: TraceFlags.NONE,
        },
        spanContext: () => {
          return {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
          };
        },
        startTime: [startTime, 0],
        endTime: [startTime + duration, 0],
        ended: true,
        duration: [duration, 0],
        status: {
          code: api.SpanStatusCode.OK,
        },
        attributes: {
          key1: 'value1',
          key2: 'value2',
        },
        links: [],
        events: [
          {
            name: 'my-event',
            time: [startTime + 10, 0],
            attributes: { key3: 'value3' },
          },
        ],
        resource: emptyResource(),
        instrumentationScope: { name: 'default', version: '0.0.1' },
        droppedAttributesCount: 0,
        droppedEventsCount: 0,
        droppedLinksCount: 0,
      };
      const span2: ReadableSpan = {
        name: 'my-span',
        kind: api.SpanKind.SERVER,
        spanContext: () => {
          return {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
          };
        },
        startTime: [startTime, 0],
        endTime: [startTime + duration, 0],
        ended: true,
        duration: [duration, 0],
        status: {
          code: api.SpanStatusCode.OK,
        },
        attributes: {},
        links: [],
        events: [],
        resource: emptyResource(),
        instrumentationScope: { name: 'default', version: '0.0.1' },
        droppedAttributesCount: 0,
        droppedEventsCount: 0,
        droppedLinksCount: 0,
      };

      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        url,
      });

      {
        const result = await exportSpans(exporter, [span1, span2]);
        assert.strictEqual(result.code, ExportResultCode.SUCCESS);
        assert.strictEqual(received.length, 1);
        assert.strictEqual(received[0].method, 'POST');
        assert.strictEqual(received[0].url, '/api/v2/spans');
        assert.strictEqual(
          received[0].headers['content-type'],
          'application/json'
        );
        assert.deepStrictEqual(received[0].body, [
          // Span 1
          {
            annotations: [
              {
                value: 'my-event',
                timestamp: (startTime + 10) * MICROS_PER_SECS,
              },
            ],
            duration: duration * MICROS_PER_SECS,
            id: span1.spanContext().spanId,
            localEndpoint: {
              serviceName: 'my-service',
            },
            name: span1.name,
            parentId: parentSpanId,
            tags: {
              key1: 'value1',
              key2: 'value2',
              'otel.status_code': 'OK',
            },
            timestamp: startTime * MICROS_PER_SECS,
            traceId: span1.spanContext().traceId,
          },
          // Span 2
          {
            duration: duration * MICROS_PER_SECS,
            id: span2.spanContext().spanId,
            kind: 'SERVER',
            localEndpoint: {
              serviceName: 'my-service',
            },
            name: span2.name,
            tags: {
              'otel.status_code': 'OK',
            },
            timestamp: hrTimeToMicroseconds([startTime, 0]),
            traceId: span2.spanContext().traceId,
          },
        ]);
      }
    });

    it('should support https protocol', async () => {
      // No TLS certificate is available here, so fake the https request.
      const requestStub = sinon
        .stub(https, 'request')
        .callsFake((_url: any, _opts: any, cb: any) => {
          const req = Object.assign(new EventEmitter(), {
            write: () => true,
            end: () => {
              const res = Object.assign(new EventEmitter(), {
                statusCode: 200,
              });
              cb(res);
              res.emit('end');
            },
          });
          return req as any;
        });

      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        url: 'https://localhost:9411/api/v2/spans',
      });

      const result = await exportSpans(exporter, [getReadableSpan()]);
      assert.strictEqual(result.code, ExportResultCode.SUCCESS);
      sinon.assert.calledOnce(requestStub);
      assert.strictEqual(
        String(requestStub.firstCall.args[0]),
        'https://localhost:9411/api/v2/spans'
      );
    });

    it('should return Failed result with 4xx', async () => {
      respond = (_req, res) => {
        res.writeHead(400).end();
      };

      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        url,
      });

      const result = await exportSpans(exporter, [getReadableSpan()]);
      assert.strictEqual(result.code, ExportResultCode.FAILED);
      assert.strictEqual(received.length, 1);
    });

    it('should return failed result with 5xx', async () => {
      respond = (_req, res) => {
        res.writeHead(500).end();
      };

      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        url,
      });

      const result = await exportSpans(exporter, [getReadableSpan()]);
      assert.strictEqual(result.code, ExportResultCode.FAILED);
      assert.strictEqual(received.length, 1);
    });

    it('should return failed result with socket error', async () => {
      respond = req => {
        req.socket.destroy();
      };

      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        url,
      });

      const result = await exportSpans(exporter, [getReadableSpan()]);
      assert.strictEqual(result.code, ExportResultCode.FAILED);
      assert.strictEqual(received.length, 1);
    });

    it('should return failed result after shutdown', done => {
      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
      });

      exporter.shutdown();

      exporter.export([getReadableSpan()], (result: ExportResult) => {
        assert.strictEqual(result.code, ExportResultCode.FAILED);
        done();
      });
    });

    it('should return the error in the result on error', async () => {
      respond = req => {
        req.socket.destroy();
      };

      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
        url,
      });

      const result = await exportSpans(exporter, [getReadableSpan()]);
      assert.deepStrictEqual(result.code, ExportResultCode.FAILED);
      assert.ok(result.error instanceof Error);
      assert.match(result.error.message, /socket hang up/);
    });
  });

  it('should set serviceName per-span if resource has one', async () => {
    const resource_service_name = 'resource_service_name';
    const resource_service_name_prime = 'resource_service_name_prime';

    const parentSpanId = '5c1c63257de34c67';
    const startTime = 1566156729709;
    const duration = 2000;

    const span1: ReadableSpan = {
      name: 'my-span',
      kind: api.SpanKind.INTERNAL,
      parentSpanContext: {
        spanId: parentSpanId,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        traceFlags: TraceFlags.NONE,
      },
      spanContext: () => ({
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
      }),
      startTime: [startTime, 0],
      endTime: [startTime + duration, 0],
      ended: true,
      duration: [duration, 0],
      status: {
        code: api.SpanStatusCode.OK,
      },
      attributes: {
        key1: 'value1',
        key2: 'value2',
      },
      links: [],
      events: [
        {
          name: 'my-event',
          time: [startTime + 10, 0],
          attributes: { key3: 'value3' },
        },
      ],
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: resource_service_name,
      }),
      instrumentationScope: { name: 'default', version: '0.0.1' },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    };
    const span2: ReadableSpan = {
      name: 'my-span',
      kind: api.SpanKind.SERVER,
      spanContext: () => ({
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
      }),
      startTime: [startTime, 0],
      endTime: [startTime + duration, 0],
      ended: true,
      duration: [duration, 0],
      status: {
        code: api.SpanStatusCode.OK,
      },
      attributes: {},
      links: [],
      events: [],
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: resource_service_name_prime,
      }),
      instrumentationScope: { name: 'default', version: '0.0.1' },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    };

    const exporter = new ZipkinExporter({ url });

    await exportSpans(exporter, [span1, span2]);
    assert.strictEqual(received.length, 1);
    const requestBody: zipkinTypes.Span[] = received[0].body;
    assert.equal(
      requestBody[0].localEndpoint.serviceName,
      resource_service_name
    );
    assert.equal(
      requestBody[1].localEndpoint.serviceName,
      resource_service_name_prime
    );
  });

  it('should set serviceName per-span if span has attribute', async () => {
    const span_service_name = 'span_service_name';
    const span_service_name_prime = 'span_service_name_prime';

    const parentSpanId = '5c1c63257de34c67';
    const startTime = 1566156729709;
    const duration = 2000;

    const span1: ReadableSpan = {
      name: 'my-span',
      kind: api.SpanKind.INTERNAL,
      parentSpanContext: {
        spanId: parentSpanId,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        traceFlags: TraceFlags.NONE,
      },
      spanContext: () => ({
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
      }),
      startTime: [startTime, 0],
      endTime: [startTime + duration, 0],
      ended: true,
      duration: [duration, 0],
      status: {
        code: api.SpanStatusCode.OK,
      },
      attributes: {
        key1: 'value1',
        key2: 'value2',
        [ATTR_SERVICE_NAME]: span_service_name,
      },
      links: [],
      events: [
        {
          name: 'my-event',
          time: [startTime + 10, 0],
          attributes: { key3: 'value3' },
        },
      ],
      resource: emptyResource(),
      instrumentationScope: { name: 'default', version: '0.0.1' },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    };
    const span2: ReadableSpan = {
      name: 'my-span',
      kind: api.SpanKind.SERVER,
      spanContext: () => ({
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
      }),
      startTime: [startTime, 0],
      endTime: [startTime + duration, 0],
      ended: true,
      duration: [duration, 0],
      status: {
        code: api.SpanStatusCode.OK,
      },
      attributes: {
        [ATTR_SERVICE_NAME]: span_service_name_prime,
      },
      links: [],
      events: [],
      resource: emptyResource(),
      instrumentationScope: { name: 'default', version: '0.0.1' },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    };

    const exporter = new ZipkinExporter({ url });

    await exportSpans(exporter, [span1, span2]);
    assert.strictEqual(received.length, 1);
    const requestBody: zipkinTypes.Span[] = received[0].body;
    assert.equal(requestBody[0].localEndpoint.serviceName, span_service_name);
    assert.equal(
      requestBody[1].localEndpoint.serviceName,
      span_service_name_prime
    );
  });

  describe('force flush', () => {
    it('forceFlush should flush spans and return', async () => {
      const exporter = new ZipkinExporter({});
      await exporter.forceFlush();
    });
  });

  describe('when env.OTEL_EXPORTER_ZIPKIN_ENDPOINT is set', () => {
    beforeEach(() => {
      process.env.OTEL_EXPORTER_ZIPKIN_ENDPOINT = url;
    });
    afterEach(() => {
      delete process.env.OTEL_EXPORTER_ZIPKIN_ENDPOINT;
    });
    it('should use url from env', async () => {
      const exporter = new ZipkinExporter({
        serviceName: 'my-service',
      });

      const result = await exportSpans(exporter, [getReadableSpan()]);
      assert.strictEqual(result.code, ExportResultCode.SUCCESS);
      assert.strictEqual(received.length, 1);
    });
  });
});
