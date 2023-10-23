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
import { ExportPromiseQueue } from '../../../common/export-promise-queue';
import { OtlpProtoMetricsConfiguration } from '../../configuration/types';
import { DefaultingOtlpProtoMetricsConfigurationProvider } from '../../configuration/providers/defaulting';
import { createProtobufMetricsSerializer } from '../../protobuf/serialization-utils';
import { RetryingTransport } from '../../../common/retrying-transport';
import { XhrTransport } from '../../../common/http/browser/xhr-transport';
import { IExporterTransport } from '../../../common/exporter-transport';
import { SendBeaconTransport } from '../../../common/http/browser/send-beacon-transport';
import { addShutdownOnUnload } from '../../../common/browser/shutdown-on-unload';

export function createBrowserMetricsExporter(
  options: Partial<OtlpProtoMetricsConfiguration>
): PushMetricExporter {
  const configuration = new DefaultingOtlpProtoMetricsConfigurationProvider(
    options,
    {}
  ).provide();

  const useXHR =
    !!options.headers || typeof navigator.sendBeacon !== 'function';

  let transport: IExporterTransport | undefined = undefined;
  if (useXHR) {
    // only XHR needs to retry, sendBeacon does not get responses
    transport = new RetryingTransport(
      new XhrTransport({
        url: configuration.url,
        headers: configuration.headers,
        timeoutMillis: configuration.timeoutMillis,
        blobType: 'application/x-protobuf',
      })
    );
  } else {
    transport = new SendBeaconTransport({
      url: configuration.url,
      blobType: 'application/x-protobuf',
    });
  }

  const promiseQueue = new ExportPromiseQueue(configuration.concurrencyLimit);
  const exporter = new OTLPHttpMetricsExporter(
    transport,
    createProtobufMetricsSerializer(),
    promiseQueue,
    configuration.temporalitySelector
  );
  addShutdownOnUnload(exporter);
  return exporter;
}
