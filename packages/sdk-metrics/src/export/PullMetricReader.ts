/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricReader } from './MetricReader';
import type { PullMetricExporter } from './MetricExporter';
import type { MetricProducer } from './MetricProducer';
import type { CardinalityLimits } from './CardinalitySelector';
import { createCardinalitySelector } from './CardinalitySelector';

export interface PullMetricReaderOptions {
  /**
   * The backing exporter for the metric reader. It is handed a
   * {@link MetricProducer} on construction of the reader and collects through
   * it whenever it is scraped.
   */
  exporter: PullMetricExporter;
  /**
   * **Note, this option is experimental**. Additional MetricProducers to use as a source of
   * aggregated metric data in addition to the SDK's metric data. The resource returned by
   * these MetricProducers is ignored; the SDK's resource will be used instead.
   * @experimental
   */
  metricProducers?: MetricProducer[];
  /**
   * Cardinality limits for the metric reader, applied per instrument type.
   * If not configured, defaults to 2000 time series per instrument.
   */
  cardinalityLimits?: CardinalityLimits;
  /**
   * The component type used for reporting self-observability SDK metrics.
   * Defaults to `PullMetricReader`.
   * @experimental This option is experimental and is subject to breaking changes in minor releases.
   */
  otelComponentType?: string;
}

/**
 * {@link MetricReader} which collects metrics when its
 * {@link PullMetricExporter} is asked for them (e.g. when a Prometheus server
 * scrapes the exporter's endpoint).
 */
export class PullMetricReader extends MetricReader {
  private readonly _exporter: PullMetricExporter;

  constructor(options: PullMetricReaderOptions) {
    const { exporter, metricProducers, cardinalityLimits, otelComponentType } =
      options;
    super({
      aggregationSelector: exporter.selectAggregation?.bind(exporter),
      aggregationTemporalitySelector:
        exporter.selectAggregationTemporality?.bind(exporter),
      cardinalitySelector: createCardinalitySelector(cardinalityLimits),
      metricProducers,
      otelComponentType,
    });
    this._exporter = exporter;
    // Hand the exporter a producer right away, so that exporters that start
    // serving on construction (e.g. an HTTP server) can do so. Collecting
    // before this reader is registered with a MeterProvider rejects.
    exporter.setMetricProducer({
      collect: collectOptions => this.collect(collectOptions),
    });
  }

  /**
   * Pull exporters only report when asked, so there is nothing to flush.
   */
  protected override async onForceFlush(): Promise<void> {
    // do nothing
  }

  protected override onShutdown(): Promise<void> {
    return this._exporter.shutdown();
  }
}
