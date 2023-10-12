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

import { baggageUtils, getEnv } from '@opentelemetry/core';
import {
  appendResourcePathToUrl,
  appendRootPathToUrlIfNeeded,
  OTLPExporterConfigBase,
} from '@opentelemetry/otlp-exporter-base';
import {
  OTLPProtoExporterNodeBase,
  ServiceClientType,
} from '@opentelemetry/otlp-proto-exporter-base';
import {
  createExportLogsServiceRequest,
  IExportLogsServiceRequest,
  IExportMetricsServiceResponse,
} from '@opentelemetry/otlp-transformer';

import { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';

const DEFAULT_COLLECTOR_RESOURCE_PATH = 'v1/logs';
const DEFAULT_COLLECTOR_URL = `http://localhost:4318/${DEFAULT_COLLECTOR_RESOURCE_PATH}`;

/**
 * Collector Trace Exporter for Node
 */
export class OTLPLogExporter
  extends OTLPProtoExporterNodeBase<
    ReadableLogRecord,
    IExportLogsServiceRequest,
    IExportMetricsServiceResponse
  >
  implements LogRecordExporter
{
  constructor(config: OTLPExporterConfigBase = {}) {
    super(config, ServiceClientType.LOGS, createExportLogsServiceRequest);
    this.headers = Object.assign(
      this.headers,
      baggageUtils.parseKeyPairsIntoRecord(
        getEnv().OTEL_EXPORTER_OTLP_LOGS_HEADERS
      )
    );
  }

  getDefaultUrl(config: OTLPExporterConfigBase): string {
    return typeof config.url === 'string'
      ? config.url
      : getEnv().OTEL_EXPORTER_OTLP_LOGS_ENDPOINT.length > 0
      ? appendRootPathToUrlIfNeeded(getEnv().OTEL_EXPORTER_OTLP_LOGS_ENDPOINT)
      : getEnv().OTEL_EXPORTER_OTLP_ENDPOINT.length > 0
      ? appendResourcePathToUrl(
          getEnv().OTEL_EXPORTER_OTLP_ENDPOINT,
          DEFAULT_COLLECTOR_RESOURCE_PATH
        )
      : DEFAULT_COLLECTOR_URL;
  }
}
