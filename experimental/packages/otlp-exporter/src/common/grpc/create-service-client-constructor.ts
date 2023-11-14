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

import * as grpc from '@grpc/grpc-js';

/*
TODO: kept for later
const logsPath = '/opentelemetry.proto.collector.logs.v1.LogsService/Export';
const tracesPath= '/opentelemetry.proto.collector.trace.v1.TraceService/Export';

const logsServiceName = 'LogsExportService';
const traceServiceName = 'TraceExportService';
 */

export function createServiceClientConstructor(
  path: string,
  name: string
): grpc.ServiceClientConstructor {
  const serviceDefinition = {
    export: {
      path: path,
      requestStream: false,
      responseStream: false,
      // Serialization happens in ISerializer
      requestSerialize: (arg: Buffer) => {
        return arg;
      },
      requestDeserialize: (_arg: Buffer) => {
        // never used
        return {};
      },
      responseSerialize: (arg: Buffer) => {
        // never used
        return arg;
      },
      // Deserialization happens in ISerializer
      responseDeserialize: (arg: Buffer) => {
        return arg;
      },
    },
  };

  const clientConstructor = grpc.makeGenericClientConstructor(
    serviceDefinition,
    name
  );

  return clientConstructor;
}
