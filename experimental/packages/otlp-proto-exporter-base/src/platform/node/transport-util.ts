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
  OTLPExporterError,
  requestParams,
  sendWithHttp,
} from '@opentelemetry/otlp-exporter-base';

import { diag } from '@opentelemetry/api';
import { deserializeItems, serializeItems } from '../serialization-util';
import { ServiceClientType } from '../types';

export function sendAsync<ExportItem, ServiceResponse>(
  params: requestParams,
  clientType: ServiceClientType,
  objects: ExportItem[],
  onSuccess: (response?: ServiceResponse) => void,
  onError: (error: OTLPExporterError) => void
): Promise<void> {
  const promise = new Promise<ServiceResponse | undefined>(
    (resolve, reject) => {
      send(params, clientType, objects, resolve, reject);
    }
  ).then(onSuccess, onError);
  return promise;
}

export function send<ServiceRequest, ServiceResponse>(
  params: requestParams,
  clientType: ServiceClientType,
  request: ServiceRequest,
  onSuccess: (response?: ServiceResponse) => void,
  onError: (error: OTLPExporterError) => void
): void {
  const body = serializeItems<ServiceRequest>(clientType, request);
  if (body) {
    sendWithHttp(
      params,
      Buffer.from(body),
      'application/x-protobuf',
      response => {
        try {
          if (response) {
            const serviceResponse = deserializeItems(clientType, response.data);
            const stringResponse = JSON.stringify(serviceResponse);
            diag.warn(stringResponse);
          }
        } catch (err) {
          diag.warn(err);
        }

        onSuccess();
      },
      error => {
        onError(error);
      }
    );
  } else {
    onError(new OTLPExporterError('No proto'));
  }
}
