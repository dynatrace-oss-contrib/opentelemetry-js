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
import { HTTP_METRICS_DEFAULT_CONFIGURATION } from '../../configuration/default-configuration';
import { OtlpHttpProtoMetricsConfiguration } from './configuration';
import {
  createMetricsPartialSuccessHandler,
  createOtlpMetricsExporter,
  DefaultingMetricsConfigurationProvider,
} from '@opentelemetry/otlp-metrics-exporter-base';
import { DefaultingOtlpHttpConfigurationProvider } from '@opentelemetry/otlp-http-exporter-base';
import {
  ExportPromiseQueue,
  OTLPExportDelegate,
  RetryingTransport,
} from '@opentelemetry/otlp-exporter-base';
import {
  SendBeaconTransport,
  XhrTransport,
} from '@opentelemetry/otlp-http-exporter-browser-base';
import { createProtobufMetricsSerializer } from '../../internal/metrics-serializer';
import { createProtobufMetricsTransformer } from '../../internal/metrics-transformer';

export function createMetricsExporter(
  options: Partial<OtlpHttpProtoMetricsConfiguration>
): PushMetricExporter {
  const metricsConfiguration = new DefaultingMetricsConfigurationProvider(
    options,
    {}
  ).provide();

  const httpConfiguration = new DefaultingOtlpHttpConfigurationProvider(
    options,
    {},
    HTTP_METRICS_DEFAULT_CONFIGURATION
  ).provide();

  const useXHR =
    !!options.headers || typeof navigator.sendBeacon !== 'function';

  const transport = useXHR
    ? new RetryingTransport(
        new XhrTransport({
          url: httpConfiguration.url,
          headers: httpConfiguration.headers,
          timeoutMillis: httpConfiguration.timeoutMillis,
          blobType: 'application/x-protobuf',
        })
      )
    : new SendBeaconTransport({
        url: httpConfiguration.url,
        blobType: 'application/x-protobuf',
      });

  const promiseQueue = new ExportPromiseQueue(
    httpConfiguration.concurrencyLimit
  );

  const exporterDelegate = new OTLPExportDelegate(
    transport,
    createProtobufMetricsTransformer(),
    createProtobufMetricsSerializer(),
    promiseQueue,
    createMetricsPartialSuccessHandler()
  );

  return createOtlpMetricsExporter(
    exporterDelegate,
    metricsConfiguration.temporalitySelector
  );
}
