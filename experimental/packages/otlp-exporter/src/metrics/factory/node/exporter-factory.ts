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
import { HttpExporterTransport } from '../../../common/http/node/http-exporter-transport';
import { ExportPromiseQueue } from '../../../common/export-promise-queue';
import { OtlpHttpMetricsConfiguration } from '../../configuration/types';
import { EnvironmentOtlpProtoMetricsConfigurationProvider } from '../../configuration/providers/environment';
import { createProtobufMetricsSerializer } from '../../protobuf/serialization-utils';
import { RetryingTransport } from '../../../common/retrying-transport';
import { OTLPExportDelegate } from '../../../common/otlp-export-delegate';
import { createProtobufMetricsTransformer } from '../../protobuf/metrics-transformer';
import { createMetricsPartialSuccessHandler } from '../../partial-success-handler';
import { OTLPMetricsExporter } from '../../otlp-metrics-exporter';
import { DefaultingOtlpHttpConfigurationProvider } from '../../../common/http/configuration/defaulting-provider';
import { DefaultingMetricsConfigurationProvider } from '../../configuration/providers/defaulting';
import { HTTP_METRICS_DEFAULT_CONFIGURATION } from '../../configuration/default-configuration';
import { NodeHttpConfiguration } from '../../../common/http/node/configuration/configuration';
import { DefaultingNodeHttpConfigurationProvider } from '../../../common/http/node/configuration/defaulting-provider';

export function createOtlpMetricsExporter(
  options: Partial<OtlpHttpMetricsConfiguration & NodeHttpConfiguration>
): PushMetricExporter {
  const environmentConfiguration =
    new EnvironmentOtlpProtoMetricsConfigurationProvider().provide();

  const metricsConfiguration = new DefaultingMetricsConfigurationProvider(
    options,
    environmentConfiguration
  ).provide();

  const httpConfiguration = new DefaultingOtlpHttpConfigurationProvider(
    options,
    environmentConfiguration,
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

  return new OTLPMetricsExporter(
    exportDelegate,
    metricsConfiguration.temporalitySelector
  );
}
