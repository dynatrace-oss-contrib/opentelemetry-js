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

import * as root from '../generated/root';
import { ServiceClientType } from './types';
import type * as protobuf from 'protobufjs';

export interface ExportType<T, R = T & { toJSON: () => unknown }> {
  create(properties?: T): R;
  encode(message: T, writer?: protobuf.Writer): protobuf.Writer;
  decode(reader: protobuf.Reader | Uint8Array, length?: number): R;
}

export function getExportRequestProto<ServiceRequest>(
  clientType: ServiceClientType
): ExportType<ServiceRequest> {
  if (clientType === ServiceClientType.SPANS) {
    return root.opentelemetry.proto.collector.trace.v1
      .ExportTraceServiceRequest as unknown as ExportType<ServiceRequest>;
  } else if (clientType === ServiceClientType.LOGS) {
    return root.opentelemetry.proto.collector.logs.v1
      .ExportLogsServiceRequest as unknown as ExportType<ServiceRequest>;
  } else {
    return root.opentelemetry.proto.collector.metrics.v1
      .ExportMetricsServiceRequest as unknown as ExportType<ServiceRequest>;
  }
}

export function getExportResponseProto<ServiceResponse>(
  clientType: ServiceClientType
): ExportType<ServiceResponse> {
  if (clientType === ServiceClientType.SPANS) {
    return root.opentelemetry.proto.collector.trace.v1
      .ExportTraceServiceResponse as unknown as ExportType<ServiceResponse>;
  } else if (clientType === ServiceClientType.LOGS) {
    return root.opentelemetry.proto.collector.logs.v1
      .ExportLogsServiceResponse as unknown as ExportType<ServiceResponse>;
  } else {
    return root.opentelemetry.proto.collector.metrics.v1
      .ExportMetricsServiceResponse as unknown as ExportType<ServiceResponse>;
  }
}

export function serializeItems<ServiceRequest>(
  clientType: ServiceClientType,
  request: ServiceRequest
): Uint8Array | undefined {
  const exportRequestType = getExportRequestProto<ServiceRequest>(clientType);

  const message = exportRequestType.create(request);
  if (message) {
    return exportRequestType.encode(message).finish();
  }
  return undefined;
}

export function deserializeItems<ServiceResponse>(
  clientType: ServiceClientType,
  // TODO: this can probably be Uint8Array (can get from Xhr and http)
  data: string | Buffer
): ServiceResponse {
  const exportResponseType =
    getExportResponseProto<ServiceResponse>(clientType);

  return exportResponseType.decode(Buffer.from(data));
}
