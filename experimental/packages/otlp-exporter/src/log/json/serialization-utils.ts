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
  IExportLogsServiceRequest,
  IExportLogsServiceResponse,
} from '@opentelemetry/otlp-transformer';
import { ILogsSerializer } from '../logs-serializer';

export function createLogsSerializer(): ILogsSerializer {
  return {
    serializeRequest,
    deserializeResponse,
  };
}

function serializeRequest(
  request: IExportLogsServiceRequest
): Uint8Array | undefined {
  return Buffer.from(JSON.stringify(request));
}

function deserializeResponse(data: Buffer): IExportLogsServiceResponse {
  return JSON.parse(data.toString());
}
