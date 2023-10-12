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

import {
  AggregationTemporality,
  AggregationTemporalitySelector,
  InstrumentType,
  PushMetricExporter,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { createExportMetricsServiceRequest } from '@opentelemetry/otlp-transformer';
import { IMetricsSerializer } from './serialization-utils';
import { IExporterTransport } from '../common/exporter-transport';
import { diag } from '@opentelemetry/api';
import { IExportPromiseQueue } from '../common/export-promise-queue';

export class OTLPProtoMetricsExporter implements PushMetricExporter {
  constructor(
    private _transport: IExporterTransport,
    private _serializer: IMetricsSerializer,
    private _promiseQueue: IExportPromiseQueue,
    private _temporalitySelector: AggregationTemporalitySelector
  ) {}

  export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void
  ): void {
    // don't do any work if too many exports are in progress.
    if (this._promiseQueue.hasReachedLimit()) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error('Sending queue is full'),
      });
      return;
    }

    const internalRequest = createExportMetricsServiceRequest([metrics]);
    const serializedRequest =
      this._serializer.serializeRequest(internalRequest);

    if (serializedRequest == null) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error('Nothing to send'),
      });
      return;
    }

    this._promiseQueue.pushPromise(
      this._transport.send(Buffer.from(serializedRequest)).then(
        response => {
          try {
            const metricsResponse = this._serializer.deserializeResponse(
              response.data
            );
            if (metricsResponse.partialSuccess != null) {
              diag.warn(
                `Export succeeded partially, rejected data points: ${metricsResponse.partialSuccess.rejectedDataPoints}, message:\n${metricsResponse.partialSuccess.errorMessage}`
              );
            }
          } catch (err) {
            diag.error('Invalid response from remote', err);
          }

          // Even if we cannot deserialize the response, we can consider the export still successful.
          resultCallback({
            code: ExportResultCode.SUCCESS,
          });
        },
        reason =>
          resultCallback({
            code: ExportResultCode.FAILED,
            error: reason,
          })
      )
    );
  }

  selectAggregationTemporality(
    instrumentType: InstrumentType
  ): AggregationTemporality {
    return this._temporalitySelector(instrumentType);
  }

  forceFlush(): Promise<void> {
    return this._promiseQueue.awaitAll();
  }

  shutdown(): Promise<void> {
    return this.forceFlush();
  }
}
