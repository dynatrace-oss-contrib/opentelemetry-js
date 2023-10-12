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

import {
  OTLPMetricExporterBase,
  OTLPMetricExporterOptions,
} from '@opentelemetry/exporter-metrics-otlp-http';
import {
  OTLPProtoExporterNodeBase,
  ServiceClientType,
} from '@opentelemetry/otlp-proto-exporter-base';
import { baggageUtils, getEnv } from '@opentelemetry/core';
import { ResourceMetrics } from '@opentelemetry/sdk-metrics';
import {
  appendResourcePathToUrl,
  appendRootPathToUrlIfNeeded,
  OTLPExporterNodeConfigBase,
} from '@opentelemetry/otlp-exporter-base';
import {
  createExportMetricsServiceRequest,
  IExportMetricsServiceRequest,
  IExportMetricsServiceResponse,
} from '@opentelemetry/otlp-transformer';
import { VERSION } from './version';

const DEFAULT_COLLECTOR_RESOURCE_PATH = 'v1/metrics';
const DEFAULT_COLLECTOR_URL = `http://localhost:4318/${DEFAULT_COLLECTOR_RESOURCE_PATH}`;
const USER_AGENT = {
  'User-Agent': `OTel-OTLP-Exporter-JavaScript/${VERSION}`,
};

class OTLPMetricExporterNodeProxy extends OTLPProtoExporterNodeBase<
  ResourceMetrics,
  IExportMetricsServiceRequest,
  IExportMetricsServiceResponse
> {
  constructor(config?: OTLPExporterNodeConfigBase & OTLPMetricExporterOptions) {
    super(config, ServiceClientType.METRICS, createExportMetricsServiceRequest);
    this.headers = {
      ...this.headers,
      ...USER_AGENT,
      ...baggageUtils.parseKeyPairsIntoRecord(
        getEnv().OTEL_EXPORTER_OTLP_METRICS_HEADERS
      ),
    };
  }

  getDefaultUrl(config: OTLPExporterNodeConfigBase) {
    return typeof config.url === 'string'
      ? config.url
      : getEnv().OTEL_EXPORTER_OTLP_METRICS_ENDPOINT.length > 0
      ? appendRootPathToUrlIfNeeded(
          getEnv().OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
        )
      : getEnv().OTEL_EXPORTER_OTLP_ENDPOINT.length > 0
      ? appendResourcePathToUrl(
          getEnv().OTEL_EXPORTER_OTLP_ENDPOINT,
          DEFAULT_COLLECTOR_RESOURCE_PATH
        )
      : DEFAULT_COLLECTOR_URL;
  }
}

export class OTLPMetricExporter extends OTLPMetricExporterBase<OTLPMetricExporterNodeProxy> {
  constructor(config?: OTLPExporterNodeConfigBase & OTLPMetricExporterOptions) {
    super(new OTLPMetricExporterNodeProxy(config), config);
  }
}
