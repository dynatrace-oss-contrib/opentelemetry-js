/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExportResult } from '@opentelemetry/core';
import type { AggregationTemporality } from './AggregationTemporality';
import type { InstrumentType, ResourceMetrics } from './MetricData';
import type { AggregationOption } from '../view/AggregationOption';
import type { MetricProducer } from './MetricProducer';

/**
 * An interface that allows different metric services to export recorded data
 * in their own format.
 *
 * To export data this MUST be registered to the Metrics SDK with a MetricReader.
 */
export interface PushMetricExporter {
  /**
   * Called to export sampled {@link ResourceMetrics}.
   * @param metrics the metric data to be exported.
   * @param resultCallback callback for when the export has completed
   */
  export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void
  ): void;

  /**
   * Ensure that the export of any metrics the exporter has received is
   * completed before the returned promise is settled.
   */
  forceFlush(): Promise<void>;

  /**
   * Select the {@link AggregationTemporality} for the given
   * {@link InstrumentType} for this exporter.
   */
  selectAggregationTemporality?(
    instrumentType: InstrumentType
  ): AggregationTemporality;

  /**
   * Select the {@link Aggregation} for the given
   * {@link InstrumentType} for this exporter.
   */
  selectAggregation?(instrumentType: InstrumentType): AggregationOption;

  /**
   * Returns a promise which resolves when the last exportation is completed.
   * Further calls to {@link PushMetricExporter.export} may not export the
   * data.
   */
  shutdown(): Promise<void>;
}

/**
 * An exporter that reports metrics passively, when asked for them by a
 * scraper (e.g. Prometheus), rather than on its own schedule.
 *
 * To export data this MUST be registered to the Metrics SDK with a
 * {@link PullMetricReader}. The reader hands the exporter a
 * {@link MetricProducer} via {@link PullMetricExporter.setMetricProducer},
 * which the exporter calls whenever it is scraped.
 */
export interface PullMetricExporter {
  /**
   * Set the {@link MetricProducer} this exporter collects metrics from. This
   * is called once by the {@link PullMetricReader} the exporter is passed to.
   *
   * <p> NOTE: implementations SHOULD throw when called more than once.
   *
   * @param metricProducer producer whose `collect()` returns the metrics
   *   gathered by the reader (SDK metrics plus any additional producers).
   */
  setMetricProducer(metricProducer: MetricProducer): void;

  /**
   * Select the {@link AggregationTemporality} for the given
   * {@link InstrumentType} for this exporter.
   */
  selectAggregationTemporality?(
    instrumentType: InstrumentType
  ): AggregationTemporality;

  /**
   * Select the {@link Aggregation} for the given
   * {@link InstrumentType} for this exporter.
   */
  selectAggregation?(instrumentType: InstrumentType): AggregationOption;

  /**
   * Shuts the exporter down, e.g. stops any server it runs. Called when the
   * owning {@link PullMetricReader} is shut down.
   */
  shutdown(): Promise<void>;
}
