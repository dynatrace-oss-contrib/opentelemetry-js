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
import { OTLPHttpMetricsExporter } from '../../otlp-proto-metrics-exporter';
import { HttpExporterTransport } from '../../../common/http/node/http-exporter-transport';
import { ExportPromiseQueue } from '../../../common/export-promise-queue';
import { OtlpProtoMetricsConfiguration } from '../../configuration/types';
import { EnvironmentOtlpProtoMetricsConfigurationProvider } from '../../configuration/providers/environment';
import { DefaultingOtlpProtoMetricsConfigurationProvider } from '../../configuration/providers/defaulting';
import { createMetricsSerializer } from '../../protobuf/serialization-utils';
import { RetryingTransport } from '../../../common/retrying-transport';

export function createNodeOtlpProtoExporter(
  options: Partial<OtlpProtoMetricsConfiguration>
): PushMetricExporter {
  const environmentConfiguration =
    new EnvironmentOtlpProtoMetricsConfigurationProvider().provide();
  const configuration = new DefaultingOtlpProtoMetricsConfigurationProvider(
    options,
    environmentConfiguration
  ).provide();

  const transport = new HttpExporterTransport({
    url: configuration.url,
    headers: configuration.headers,
    compression: configuration.compression,
    timeoutMillis: configuration.timeoutMillis,
    agentOptions: { keepAlive: true },
  });

  const retryingTransport = new RetryingTransport(transport);

  const promiseQueue = new ExportPromiseQueue(configuration.concurrencyLimit);
  return new OTLPHttpMetricsExporter(
    retryingTransport,
    createMetricsSerializer(),
    promiseQueue,
    configuration.temporalitySelector
  );
}
