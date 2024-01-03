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

import { OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
import {
  PushMetricExporter,
  AggregationTemporality,
  ResourceMetrics,
  AggregationTemporalitySelector,
  InstrumentType,
} from '@opentelemetry/sdk-metrics';
import {
  AggregationTemporalityPreference,
  OTLPMetricExporterOptions,
} from '@opentelemetry/exporter-metrics-otlp-http';
import {
  createOtlpMetricsExporter,
  CumulativeTemporalitySelector,
  DeltaTemporalitySelector,
  LowMemoryTemporalitySelector,
} from '@opentelemetry/otlp-exporter';
import { ExportResult } from '@opentelemetry/core';

export class OTLPMetricExporter implements PushMetricExporter {
  private _exporter: PushMetricExporter;

  constructor(config?: OTLPExporterNodeConfigBase & OTLPMetricExporterOptions) {
    let selector: AggregationTemporalitySelector | undefined;
    if (
      config?.temporalityPreference ===
        AggregationTemporalityPreference.DELTA ||
      config?.temporalityPreference === AggregationTemporality.DELTA
    ) {
      selector = DeltaTemporalitySelector;
    } else if (
      config?.temporalityPreference ===
        AggregationTemporalityPreference.CUMULATIVE ||
      config?.temporalityPreference === AggregationTemporality.CUMULATIVE
    ) {
      selector = CumulativeTemporalitySelector;
    } else if (
      config?.temporalityPreference ===
      AggregationTemporalityPreference.LOWMEMORY
    ) {
      selector = LowMemoryTemporalitySelector;
    }

    this._exporter = createOtlpMetricsExporter({
      url: config?.url,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore headers will be the correct format
      headers: config?.headers,
      compression: config?.compression,
      concurrencyLimit: config?.concurrencyLimit,
      timeoutMillis: config?.timeoutMillis,
      temporalitySelector: selector,
    });
  }

  selectAggregationTemporality(
    instrumentType: InstrumentType
  ): AggregationTemporality {
    return this._exporter.selectAggregationTemporality!(instrumentType);
  }

  export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void
  ): void {
    this._exporter.export(metrics, resultCallback);
  }
  forceFlush(): Promise<void> {
    return this._exporter.forceFlush();
  }
  shutdown(): Promise<void> {
    return this._exporter.shutdown();
  }
}
