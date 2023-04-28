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
import { ResourceMetrics } from '@opentelemetry/sdk-metrics';
import {
  OTLPGRPCExporterConfigNode,
  OTLPGRPCExporterNodeBase,
  ServiceClientType,
} from '@opentelemetry/otlp-grpc-exporter-base';
import { baggageUtils, getEnv } from '@opentelemetry/core';
import { Metadata } from '@grpc/grpc-js';
import {
  createExportMetricsServiceRequest,
  IExportMetricsServiceRequest,
} from '@opentelemetry/otlp-transformer';
import { VERSION } from './version';

const USER_AGENT = {
  'User-Agent': `OTel-OTLP-Exporter-JavaScript/${VERSION}`,
};

class OTLPMetricExporterProxy extends OTLPGRPCExporterNodeBase<
  ResourceMetrics,
  IExportMetricsServiceRequest
> {
  constructor(config?: OTLPGRPCExporterConfigNode & OTLPMetricExporterOptions) {
    super(config);
    const headers = {
      ...USER_AGENT,
      ...baggageUtils.parseKeyPairsIntoRecord(
        getEnv().OTEL_EXPORTER_OTLP_METRICS_HEADERS
      ),
    };

    this.metadata ||= new Metadata();
    for (const [k, v] of Object.entries(headers)) {
      this.metadata.set(k, v);
    }
  }

  getServiceProtoPath(): string {
    return 'opentelemetry/proto/collector/metrics/v1/metrics_service.proto';
  }

  getServiceClientType(): ServiceClientType {
    return ServiceClientType.METRICS;
  }

  convert(metrics: ResourceMetrics[]): IExportMetricsServiceRequest {
    return createExportMetricsServiceRequest(metrics);
  }
}

/**
 * OTLP-gRPC metric exporter
 */
export class OTLPMetricExporter extends OTLPMetricExporterBase<OTLPMetricExporterProxy> {
  constructor(config?: OTLPGRPCExporterConfigNode & OTLPMetricExporterOptions) {
    super(new OTLPMetricExporterProxy(config), config);
  }
}
