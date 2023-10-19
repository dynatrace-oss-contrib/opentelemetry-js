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

import * as sinon from 'sinon';
import { OTLPHttpMetricsExporter } from '../../src/metrics/otlp-proto-metrics-exporter';
import { IExporterTransport } from '../../src/common/exporter-transport';
import {
  createExportMetricsServiceRequest,
  IExportMetricsServiceResponse,
} from '@opentelemetry/otlp-transformer';
import { IExportPromiseQueue } from '../../src/common/export-promise-queue';
import { AggregationTemporalitySelector } from '@opentelemetry/sdk-metrics';
import { resourceMetrics } from './fixtures/resource-metrics';
import { ExportResultCode } from '@opentelemetry/core';
import * as assert from 'assert';
import { IExportResponse } from '../../src/common/http/http-transport-types';
import { diag } from '@opentelemetry/api';
import {IMetricsSerializer} from '../../src/metrics/metrics-serializer';

describe('OTLPProtoMetricsExporter', function () {
  describe('export', function () {
    afterEach(function () {
      sinon.restore();
    });

    it('fails if serializer returns undefined', function (done) {
      // transport does not need to do anything in this case.
      const transportStubs = {
        send: sinon.stub(),
      };
      const mockTransport = <IExporterTransport>transportStubs;

      const serializerStubs = {
        serializeRequest: sinon.stub().returns(undefined),
        deserializeResponse: sinon.stub(),
      };
      const mockSerializer = <IMetricsSerializer>serializerStubs;

      // promise queue has not reached capacity yet
      const promiseQueueStubs = {
        pushPromise: sinon.stub(),
        hasReachedLimit: sinon.stub().returns(false),
        awaitAll: sinon.stub(),
      };
      const promiseQueue = <IExportPromiseQueue>promiseQueueStubs;

      const temporalitySelector: AggregationTemporalitySelector = sinon.stub();

      const exporter = new OTLPHttpMetricsExporter(
        mockTransport,
        mockSerializer,
        promiseQueue,
        temporalitySelector
      );

      exporter.export(resourceMetrics, result => {
        try {
          assert.strictEqual(result.code, ExportResultCode.FAILED);
          assert.ok(result.error);
        } catch (err) {
          // ensures we throw if there are more calls to result;
          done(err);
        }
      });

      sinon.assert.calledOnceWithExactly(
        serializerStubs.serializeRequest,
        createExportMetricsServiceRequest([resourceMetrics])
      );
      sinon.assert.notCalled(serializerStubs.deserializeResponse);
      sinon.assert.notCalled(transportStubs.send);
      sinon.assert.notCalled(promiseQueueStubs.pushPromise);
      sinon.assert.calledOnce(promiseQueueStubs.hasReachedLimit);
      sinon.assert.notCalled(promiseQueueStubs.awaitAll);
      done();
    });

    it('fails if promise queue is full', function (done) {
      // transport does not need to do anything in this case.
      const transportStubs = {
        send: sinon.stub(),
      };
      const mockTransport = <IExporterTransport>transportStubs;

      // serializer should be never used when the queue is full, so it does not need to do anything.
      const serializerStubs = {
        serializeRequest: sinon.stub(),
        deserializeResponse: sinon.stub(),
      };
      const mockSerializer = <IMetricsSerializer>serializerStubs;

      // make queue signal that it is full.
      const promiseQueueStubs = {
        pushPromise: sinon.stub(),
        hasReachedLimit: sinon.stub().returns(true),
        awaitAll: sinon.stub(),
      };
      const promiseQueue = <IExportPromiseQueue>promiseQueueStubs;

      // temporality selector is irrelevant for this test
      const temporalitySelector: AggregationTemporalitySelector = sinon.stub();

      const exporter = new OTLPHttpMetricsExporter(
        mockTransport,
        mockSerializer,
        promiseQueue,
        temporalitySelector
      );

      exporter.export(resourceMetrics, result => {
        try {
          assert.strictEqual(result.code, ExportResultCode.FAILED);
          assert.ok(result.error);
        } catch (err) {
          // ensures we throw if there are more calls to result;
          done(err);
        }
      });

      sinon.assert.notCalled(serializerStubs.serializeRequest);
      sinon.assert.notCalled(serializerStubs.deserializeResponse);
      sinon.assert.notCalled(transportStubs.send);
      sinon.assert.notCalled(promiseQueueStubs.pushPromise);
      sinon.assert.calledOnce(promiseQueueStubs.hasReachedLimit);
      sinon.assert.notCalled(promiseQueueStubs.awaitAll);
      done();
    });

    it('returns success if send promise resolves', function (done) {
      // returns full success response (empty body)
      const exportResponse: IExportResponse = {
        data: Buffer.from([]),
        status: 'success',
      };
      // transport fakes empty response
      const transportStubs = {
        send: sinon.stub().returns(Promise.resolve(exportResponse)),
      };
      const mockTransport = <IExporterTransport>transportStubs;

      const serializerStubs = {
        // simulate that the serializer returns something to send
        serializeRequest: sinon.stub().returns(Buffer.from([1])),
        // simulate that it returns a full success (empty response)
        deserializeResponse: sinon.stub().returns({}),
      };
      const mockSerializer = <IMetricsSerializer>serializerStubs;

      // mock a queue that has not yet reached capacity
      const promiseQueueStubs = {
        pushPromise: sinon.stub(),
        hasReachedLimit: sinon.stub().returns(false),
        awaitAll: sinon.stub(),
      };
      const promiseQueue = <IExportPromiseQueue>promiseQueueStubs;

      // temporality selector is irrelevant for this test
      const temporalitySelector: AggregationTemporalitySelector = sinon.stub();

      const exporter = new OTLPHttpMetricsExporter(
        mockTransport,
        mockSerializer,
        promiseQueue,
        temporalitySelector
      );

      exporter.export(resourceMetrics, result => {
        try {
          assert.strictEqual(result.code, ExportResultCode.SUCCESS);
          assert.strictEqual(result.error, undefined);

          // assert here as otherwise the promise will not have executed yet
          // TODO: assert correct values are passed to the stubs.
          sinon.assert.calledOnce(serializerStubs.serializeRequest);
          sinon.assert.calledOnce(serializerStubs.deserializeResponse);
          sinon.assert.calledOnce(transportStubs.send);
          sinon.assert.calledOnce(promiseQueueStubs.pushPromise);
          sinon.assert.calledOnce(promiseQueueStubs.hasReachedLimit);
          sinon.assert.notCalled(promiseQueueStubs.awaitAll);
          done();
        } catch (err) {
          // ensures we throw if there are more calls to result;
          done(err);
        }
      });
    });

    it('returns success and logs if partial success is returned', function (done) {
      const spyLoggerWarn = sinon.stub(diag, 'warn');

      // returns full success response (empty body)
      const exportResponse: IExportResponse = {
        data: Buffer.from([]),
        status: 'success',
      };
      // transport does not need to do anything in this case.
      const transportStubs = {
        send: sinon.stub().returns(Promise.resolve(exportResponse)),
      };
      const mockTransport = <IExporterTransport>transportStubs;

      const response: IExportMetricsServiceResponse = {
        partialSuccess: {
          rejectedDataPoints: 10,
          errorMessage: 'mock error message',
        },
      };

      const serializerStubs = {
        // simulate that the serializer returns something to send
        serializeRequest: sinon.stub().returns(Buffer.from([1])),
        // simulate that it returns a full success (empty response)
        deserializeResponse: sinon.stub().returns(response),
      };
      const mockSerializer = <IMetricsSerializer>serializerStubs;

      // mock a queue that has not yet reached capacity
      const promiseQueueStubs = {
        pushPromise: sinon.stub(),
        hasReachedLimit: sinon.stub().returns(false),
        awaitAll: sinon.stub(),
      };
      const promiseQueue = <IExportPromiseQueue>promiseQueueStubs;

      // temporality selector is irrelevant for this test
      const temporalitySelector: AggregationTemporalitySelector = sinon.stub();

      const exporter = new OTLPHttpMetricsExporter(
        mockTransport,
        mockSerializer,
        promiseQueue,
        temporalitySelector
      );

      exporter.export(resourceMetrics, result => {
        try {
          assert.strictEqual(result.code, ExportResultCode.SUCCESS);
          assert.strictEqual(result.error, undefined);

          // assert here as otherwise the promise will not have executed yet
          sinon.assert.calledWithExactly(
            spyLoggerWarn,
            'Export succeeded partially, rejected data points: 10, message:\nmock error message'
          );
          sinon.assert.calledOnce(serializerStubs.serializeRequest);
          sinon.assert.calledOnce(serializerStubs.deserializeResponse);
          sinon.assert.calledOnce(transportStubs.send);
          sinon.assert.calledOnce(promiseQueueStubs.pushPromise);
          sinon.assert.calledOnce(promiseQueueStubs.hasReachedLimit);
          sinon.assert.notCalled(promiseQueueStubs.awaitAll);
          done();
        } catch (err) {
          // ensures we throw if there are more calls to result;
          done(err);
        }
      });
    });

    it('returns success and warns if deserializing partial success fails', function (done) {
      const spyLoggerError = sinon.stub(diag, 'error');

      // returns full success response (empty body)
      const exportResponse: IExportResponse = {
        data: Buffer.from([]),
        status: 'success',
      };
      // transport does not need to do anything in this case.
      const transportStubs = {
        send: sinon.stub().returns(Promise.resolve(exportResponse)),
      };
      const mockTransport = <IExporterTransport>transportStubs;

      const mockSerializationError = new Error('deserialization failed');
      const serializerStubs = {
        // simulate that the serializer returns something to send
        serializeRequest: sinon.stub().returns(Buffer.from([1])),
        // simulate that it returns a full success (empty response)
        deserializeResponse: sinon.stub().throws(mockSerializationError),
      };
      const mockSerializer = <IMetricsSerializer>serializerStubs;

      // mock a queue that has not yet reached capacity
      const promiseQueueStubs = {
        pushPromise: sinon.stub(),
        hasReachedLimit: sinon.stub().returns(false),
        awaitAll: sinon.stub(),
      };
      const promiseQueue = <IExportPromiseQueue>promiseQueueStubs;

      // temporality selector is irrelevant for this test
      const temporalitySelector: AggregationTemporalitySelector = sinon.stub();

      const exporter = new OTLPHttpMetricsExporter(
        mockTransport,
        mockSerializer,
        promiseQueue,
        temporalitySelector
      );

      exporter.export(resourceMetrics, result => {
        try {
          assert.strictEqual(result.code, ExportResultCode.SUCCESS);
          assert.strictEqual(result.error, undefined);

          // assert here as otherwise the promise will not have executed yet
          sinon.assert.calledWithExactly(
            spyLoggerError,
            'Invalid response from remote',
            mockSerializationError
          );
          sinon.assert.calledOnce(serializerStubs.serializeRequest);
          sinon.assert.calledOnce(serializerStubs.deserializeResponse);
          sinon.assert.calledOnce(transportStubs.send);
          sinon.assert.calledOnce(promiseQueueStubs.pushPromise);
          sinon.assert.calledOnce(promiseQueueStubs.hasReachedLimit);
          sinon.assert.notCalled(promiseQueueStubs.awaitAll);
          done();
        } catch (err) {
          // ensures we throw if there are more calls to result;
          done(err);
        }
      });
    });

    // TODO: test that returning failure from transprot returns failure here

    it('returns failure when send rejects', function (done) {
      const transportStubs = {
        // make transport reject
        send: sinon.stub().returns(Promise.reject(new Error())),
      };
      const mockTransport = <IExporterTransport>transportStubs;

      const serializerStubs = {
        // simulate that the serializer returns something to send
        serializeRequest: sinon.stub().returns(Buffer.from([1])),
        // does not need to do anything, should never be called.
        deserializeResponse: sinon.stub(),
      };
      const mockSerializer = <IMetricsSerializer>serializerStubs;

      // mock a queue that has not yet reached capacity
      const promiseQueueStubs = {
        pushPromise: sinon.stub(),
        hasReachedLimit: sinon.stub().returns(false),
        awaitAll: sinon.stub(),
      };
      const promiseQueue = <IExportPromiseQueue>promiseQueueStubs;

      // temporality selector is irrelevant for this test
      const temporalitySelector: AggregationTemporalitySelector = sinon.stub();

      const exporter = new OTLPHttpMetricsExporter(
        mockTransport,
        mockSerializer,
        promiseQueue,
        temporalitySelector
      );

      exporter.export(resourceMetrics, result => {
        try {
          assert.strictEqual(result.code, ExportResultCode.FAILED);
          assert.ok(result.error);

          // assert here as otherwise the promise will not have executed yet
          sinon.assert.calledOnce(serializerStubs.serializeRequest);
          sinon.assert.notCalled(serializerStubs.deserializeResponse);
          sinon.assert.calledOnce(transportStubs.send);
          sinon.assert.calledOnce(promiseQueueStubs.pushPromise);
          sinon.assert.calledOnce(promiseQueueStubs.hasReachedLimit);
          sinon.assert.notCalled(promiseQueueStubs.awaitAll);
          done();
        } catch (err) {
          // ensures we throw if there are more calls to result;
          done(err);
        }
      });
    });
  });
});
