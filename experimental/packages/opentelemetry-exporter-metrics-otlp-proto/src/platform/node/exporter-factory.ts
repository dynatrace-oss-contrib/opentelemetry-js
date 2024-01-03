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

import { PushMetricExporter } from '@opentelemetry/sdk-metrics';
import { ExportPromiseQueue } from '@opentelemetry/otlp-exporter-base';

import { RetryingTransport } from '@opentelemetry/otlp-exporter-base';
import { OTLPExportDelegate } from '@opentelemetry/otlp-exporter-base';
import { createOtlpMetricsExporter } from '@opentelemetry/otlp-metrics-exporter-base';

import { DefaultingOtlpHttpConfigurationProvider } from '@opentelemetry/otlp-http-exporter-base';

import { DefaultingMetricsConfigurationProvider } from '@opentelemetry/otlp-metrics-exporter-base';
import { createMetricsPartialSuccessHandler } from '@opentelemetry/otlp-metrics-exporter-base';
import { EnvironmentOtlpMetricsConfigurationProvider } from '@opentelemetry/otlp-metrics-exporter-base';

import { HttpExporterTransport } from '@opentelemetry/otlp-http-exporter-node-base';
import { DefaultingNodeHttpConfigurationProvider } from '@opentelemetry/otlp-http-exporter-node-base';
import { EnvironmentOtlpHttpConfigurationProvider } from '@opentelemetry/otlp-http-exporter-node-base';

import { OtlpHttpProtoMetricsConfiguration } from './configuration';
import { HTTP_METRICS_DEFAULT_CONFIGURATION } from '../../configuration/default-configuration';
import { createProtobufMetricsSerializer } from '../../internal/metrics-serializer';
import { createProtobufMetricsTransformer } from '../../internal/metrics-transformer';

export function createMetricsExporter(
  options: Partial<OtlpHttpProtoMetricsConfiguration>
): PushMetricExporter {
  const httpEnvironmentConfiguration =
    new EnvironmentOtlpHttpConfigurationProvider(
      'METRICS',
      'v1/metrics'
    ).provide();

  const metricsEnvironmentConfiguration =
    new EnvironmentOtlpMetricsConfigurationProvider().provide();

  const metricsConfiguration = new DefaultingMetricsConfigurationProvider(
    options,
    metricsEnvironmentConfiguration
  ).provide();

  const httpConfiguration = new DefaultingOtlpHttpConfigurationProvider(
    options,
    httpEnvironmentConfiguration,
    HTTP_METRICS_DEFAULT_CONFIGURATION
  ).provide();

  const nodeHttpConfiguration = new DefaultingNodeHttpConfigurationProvider(
    options
  ).provide();

  const transport = new HttpExporterTransport({
    url: httpConfiguration.url,
    headers: httpConfiguration.headers,
    compression: httpConfiguration.compression,
    timeoutMillis: httpConfiguration.timeoutMillis,
    agentOptions: nodeHttpConfiguration.agentOptions,
  });

  const retryingTransport = new RetryingTransport(transport);

  const promiseQueue = new ExportPromiseQueue(
    httpConfiguration.concurrencyLimit
  );

  const exportDelegate = new OTLPExportDelegate(
    retryingTransport,
    createProtobufMetricsTransformer(),
    createProtobufMetricsSerializer(),
    promiseQueue,
    createMetricsPartialSuccessHandler()
  );

  return createOtlpMetricsExporter(
    exportDelegate,
    metricsConfiguration.temporalitySelector
  );
}
