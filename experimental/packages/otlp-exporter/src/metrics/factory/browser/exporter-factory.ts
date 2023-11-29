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
import { ExportPromiseQueue } from '../../../common/export-promise-queue';
import { OtlpHttpMetricsConfiguration } from '../../configuration/types';
import { DefaultingMetricsConfigurationProvider } from '../../configuration/providers/defaulting';
import { createProtobufMetricsSerializer } from '../../protobuf/metrics-serializer';
import { RetryingTransport } from '../../../common/retrying-transport';
import { XhrTransport } from '../../../common/http/browser/xhr-transport';
import { IExporterTransport } from '../../../common/exporter-transport';
import { SendBeaconTransport } from '../../../common/http/browser/send-beacon-transport';
import { addShutdownOnUnload } from '../../../common/browser/shutdown-on-unload';
import { OTLPExportDelegate } from '../../../common/otlp-export-delegate';
import { createJsonMetricsTransformer } from '../../json/metrics-transformer';
import { createMetricsPartialSuccessHandler } from '../../partial-success-handler';
import { createOtlpMetricsExporter } from '../../otlp-metrics-exporter';
import { DefaultingOtlpHttpConfigurationProvider } from '../../../common/http/configuration/defaulting-provider';
import { HTTP_METRICS_DEFAULT_CONFIGURATION } from '../../configuration/default-configuration';

export function createBrowserMetricsExporter(
  options: Partial<OtlpHttpMetricsConfiguration>
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

  let transport: IExporterTransport | undefined;
  if (useXHR) {
    // only XHR needs to retry, sendBeacon does not get responses -> retry is just dead code there
    transport = new RetryingTransport(
      new XhrTransport({
        url: httpConfiguration.url,
        headers: httpConfiguration.headers,
        timeoutMillis: httpConfiguration.timeoutMillis,
        blobType: 'application/x-protobuf',
      })
    );
  } else {
    transport = new SendBeaconTransport({
      url: httpConfiguration.url,
      blobType: 'application/x-protobuf',
    });
  }

  const promiseQueue = new ExportPromiseQueue(
    httpConfiguration.concurrencyLimit
  );
  const exporterDelegate = new OTLPExportDelegate(
    transport,
    createJsonMetricsTransformer(),
    createProtobufMetricsSerializer(),
    promiseQueue,
    createMetricsPartialSuccessHandler()
  );

  const exporter = createOtlpMetricsExporter(
    exporterDelegate,
    metricsConfiguration.temporalitySelector
  );

  addShutdownOnUnload(exporter);

  return exporter;
}
