/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import { globalErrorHandler } from '@opentelemetry/core';
import type {
  AggregationOption,
  MetricProducer,
  PullMetricExporter,
} from '@opentelemetry/sdk-metrics';
import {
  AggregationTemporality,
  AggregationType,
} from '@opentelemetry/sdk-metrics';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';
import type { PrometheusMetricExporterConfig } from './export/types';
import { PrometheusSerializer } from './PrometheusSerializer';
/** Node.js v8.x compat */
import { URL } from 'url';

/**
 * A {@link PullMetricExporter} that serves metrics in the Prometheus text
 * exposition format over HTTP. Register it with the SDK through a
 * `PullMetricReader`:
 *
 * ```ts
 * new MeterProvider({
 *   readers: [new PullMetricReader({ exporter: new PrometheusMetricExporter() })],
 * });
 * ```
 */
export class PrometheusMetricExporter implements PullMetricExporter {
  static readonly DEFAULT_OPTIONS = {
    host: 'localhost',
    port: 9464,
    endpoint: '/metrics',
    prefix: '',
    appendTimestamp: false,
    withResourceConstantLabels: undefined,
    withoutScopeInfo: false,
    withoutTargetInfo: false,
  };

  private readonly _host: string;
  private readonly _port: number;
  private readonly _baseUrl: string;
  private readonly _endpoint: string;
  private readonly _server: Server;
  private readonly _prefix?: string;
  private readonly _appendTimestamp: boolean;
  private _serializer: PrometheusSerializer;
  private _startServerPromise: Promise<void> | undefined;
  private _metricProducer?: MetricProducer;

  // This will be required when histogram is implemented. Leaving here so it is not forgotten
  // Histogram cannot have a attribute named 'le'
  // private static readonly RESERVED_HISTOGRAM_LABEL = 'le';

  /**
   * Constructor
   * @param config Exporter configuration
   * @param callback Callback to be called after a server was started
   */
  constructor(
    config: PrometheusMetricExporterConfig = {},
    callback: (error: Error | void) => void = () => {}
  ) {
    this._host = config.host || PrometheusMetricExporter.DEFAULT_OPTIONS.host;
    this._port = config.port || PrometheusMetricExporter.DEFAULT_OPTIONS.port;
    this._prefix =
      config.prefix || PrometheusMetricExporter.DEFAULT_OPTIONS.prefix;
    this._appendTimestamp =
      typeof config.appendTimestamp === 'boolean'
        ? config.appendTimestamp
        : PrometheusMetricExporter.DEFAULT_OPTIONS.appendTimestamp;
    const _withResourceConstantLabels =
      config.withResourceConstantLabels ||
      PrometheusMetricExporter.DEFAULT_OPTIONS.withResourceConstantLabels;
    const _withoutScopeInfo =
      config.withoutScopeInfo ||
      PrometheusMetricExporter.DEFAULT_OPTIONS.withoutScopeInfo;
    const _withoutTargetInfo =
      config.withoutTargetInfo ||
      PrometheusMetricExporter.DEFAULT_OPTIONS.withoutTargetInfo;
    // unref to prevent prometheus exporter from holding the process open on exit
    this._server = createServer(this._requestHandler).unref();
    this._serializer = new PrometheusSerializer(
      this._prefix,
      this._appendTimestamp,
      _withResourceConstantLabels,
      _withoutTargetInfo,
      _withoutScopeInfo
    );

    this._baseUrl = `http://${this._host}:${this._port}/`;
    this._endpoint = (
      config.endpoint || PrometheusMetricExporter.DEFAULT_OPTIONS.endpoint
    ).replace(/^([^/])/, '/$1');

    if (config.preventServerStart !== true) {
      this.startServer().then(callback, err => {
        diag.error(err);
        callback(err);
      });
    } else if (callback) {
      // Do not invoke callback immediately to avoid zalgo problem.
      queueMicrotask(callback);
    }
  }

  setMetricProducer(metricProducer: MetricProducer): void {
    if (this._metricProducer) {
      throw new Error(
        'PrometheusMetricExporter can not be bound to a PullMetricReader again.'
      );
    }
    this._metricProducer = metricProducer;
  }

  selectAggregation(): AggregationOption {
    return { type: AggregationType.DEFAULT };
  }

  selectAggregationTemporality(): AggregationTemporality {
    return AggregationTemporality.CUMULATIVE;
  }

  /**
   * Shuts down the export server
   */
  shutdown(): Promise<void> {
    return this.stopServer();
  }

  /**
   * Stops the Prometheus export server
   */
  stopServer(): Promise<void> {
    if (!this._server) {
      diag.debug(
        'Prometheus stopServer() was called but server was never started.'
      );
      return Promise.resolve();
    } else {
      return new Promise(resolve => {
        this._server.close(err => {
          if (!err) {
            diag.debug('Prometheus exporter was stopped');
          } else {
            if (
              (err as unknown as { code: string }).code !==
              'ERR_SERVER_NOT_RUNNING'
            ) {
              globalErrorHandler(err);
            }
          }
          resolve();
        });
      });
    }
  }

  /**
   * Starts the Prometheus export server
   */
  startServer(): Promise<void> {
    this._startServerPromise ??= new Promise((resolve, reject) => {
      this._server.once('error', reject);
      this._server.listen(
        {
          port: this._port,
          host: this._host,
        },
        () => {
          diag.debug(
            `Prometheus exporter server started: ${this._host}:${this._port}/${this._endpoint}`
          );
          resolve();
        }
      );
    });

    return this._startServerPromise;
  }

  /**
   * Request handler that responds with the current state of metrics
   * @param _request Incoming HTTP request of server instance
   * @param response HTTP response object used to response to request
   */
  public getMetricsRequestHandler(
    _request: IncomingMessage,
    response: ServerResponse
  ): void {
    this._exportMetrics(response);
  }

  /**
   * Request handler used by http library to respond to incoming requests
   * for the current state of metrics by the Prometheus backend.
   *
   * @param request Incoming HTTP request to export server
   * @param response HTTP response object used to respond to request
   */
  private _requestHandler = (
    request: IncomingMessage,
    response: ServerResponse
  ) => {
    let pathname: string | undefined;
    try {
      if (request.url != null) {
        pathname = new URL(request.url, this._baseUrl).pathname;
      }
    } catch {
      response.statusCode = 400;
      response.end('Bad Request');
      return;
    }
    if (pathname === this._endpoint) {
      this._exportMetrics(response);
    } else {
      this._notFound(response);
    }
  };

  /**
   * Responds to incoming message with current state of all metrics.
   */
  private _exportMetrics = (response: ServerResponse) => {
    response.statusCode = 200;
    response.setHeader('content-type', 'text/plain');
    const collectPromise = this._metricProducer
      ? this._metricProducer.collect()
      : Promise.reject(
          new Error(
            'PrometheusMetricExporter is not registered with a PullMetricReader'
          )
        );
    collectPromise.then(
      collectionResult => {
        const { resourceMetrics, errors } = collectionResult;
        if (errors.length) {
          diag.error(
            'PrometheusMetricExporter: metrics collection errors',
            ...errors
          );
        }
        response.end(this._serializer.serialize(resourceMetrics));
      },
      err => {
        response.end(`# failed to export metrics: ${err}`);
      }
    );
  };

  /**
   * Responds with 404 status code to all requests that do not match the configured endpoint.
   */
  private _notFound = (response: ServerResponse) => {
    response.statusCode = 404;
    response.end();
  };
}
