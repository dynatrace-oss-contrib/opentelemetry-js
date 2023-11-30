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
import * as root from '../../generated/root';
import {
  IExportTraceServiceRequest,
  IExportTraceServiceResponse,
} from '@opentelemetry/otlp-transformer';
import { ITraceSerializer } from '../trace-serializer';

export function createProtobufTracesSerializer(): ITraceSerializer {
  return {
    serializeRequest,
    deserializeResponse,
  };
}

function serializeRequest(
  request: IExportTraceServiceRequest
): Uint8Array | undefined {
  const exportRequestType =
    root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;

  const message = exportRequestType.create(
    request as root.opentelemetry.proto.collector.trace.v1.IExportTraceServiceRequest
  );
  if (message) {
    return exportRequestType.encode(message).finish();
  }
  return undefined;
}

function deserializeResponse(data: Uint8Array): IExportTraceServiceResponse {
  const exportResponseType =
    root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;

  return exportResponseType.decode(data) as IExportTraceServiceResponse;
}
