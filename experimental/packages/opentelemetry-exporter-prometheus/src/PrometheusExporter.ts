/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PullMetricReader } from '@opentelemetry/sdk-metrics';
import type { IncomingMessage, ServerResponse } from 'http';
import type { ExporterConfig } from './export/types';
import { PrometheusMetricExporter } from './PrometheusMetricExporter';
import { OTEL_COMPONENT_TYPE_VALUE_PROMETHEUS_HTTP_TEXT_METRIC_EXPORTER } from './semconv';

/**
 * A MetricReader that serves metrics in the Prometheus text exposition format
 * over HTTP.
 *
 * @deprecated Use a `PullMetricReader` with a {@link PrometheusMetricExporter}
 * instead:
 * ```ts
 * new PullMetricReader({
 *   exporter: new PrometheusMetricExporter({ port: 9464 }),
 *   metricProducers: [...], // optional
 * });
 * ```
 */
export class PrometheusExporter extends PullMetricReader {
  static readonly DEFAULT_OPTIONS = PrometheusMetricExporter.DEFAULT_OPTIONS;

  private readonly _prometheusExporter: PrometheusMetricExporter;

  /**
   * Constructor
   * @param config Exporter configuration
   * @param callback Callback to be called after a server was started
   */
  constructor(
    config: ExporterConfig = {},
    callback: (error: Error | void) => void = () => {}
  ) {
    const { metricProducers, ...exporterConfig } = config;
    const exporter = new PrometheusMetricExporter(exporterConfig, callback);
    super({
      exporter,
      metricProducers,
      otelComponentType:
        OTEL_COMPONENT_TYPE_VALUE_PROMETHEUS_HTTP_TEXT_METRIC_EXPORTER,
    });
    this._prometheusExporter = exporter;
  }

  // These were public on PrometheusExporter before it was based on
  // PullMetricReader; keep them public to avoid a breaking change.
  override onForceFlush(): Promise<void> {
    return super.onForceFlush();
  }

  /**
   * Shuts down the export server and clears the registry
   */
  override onShutdown(): Promise<void> {
    return super.onShutdown();
  }

  /**
   * Stops the Prometheus export server
   */
  stopServer(): Promise<void> {
    return this._prometheusExporter.stopServer();
  }

  /**
   * Starts the Prometheus export server
   */
  startServer(): Promise<void> {
    return this._prometheusExporter.startServer();
  }

  /**
   * Request handler that responds with the current state of metrics
   * @param request Incoming HTTP request of server instance
   * @param response HTTP response object used to response to request
   */
  public getMetricsRequestHandler(
    request: IncomingMessage,
    response: ServerResponse
  ): void {
    this._prometheusExporter.getMetricsRequestHandler(request, response);
  }
}
