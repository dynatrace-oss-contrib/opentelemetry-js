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

import { diag } from '@opentelemetry/api';
import { ServiceClientType } from '../types';
import {
  OTLPHttpExporterBrowserBase as OTLPExporterBaseMain,
  OTLPExporterError,
  OTLPExporterConfigBase,
  sendWithXhr,
} from '@opentelemetry/otlp-exporter-base';

import {deserializeItems, serializeItems} from '../serialization-util';

/**
 * Collector Exporter abstract base class
 */
export abstract class OTLPProtoExporterBrowserBase<
  ExportItem,
  ServiceRequest,
  ServiceResponse,
> extends OTLPExporterBaseMain<ExportItem, ServiceRequest> {
  constructor(config: OTLPExporterConfigBase = {}) {
    super(config);
  }

  override send(
    objects: ExportItem[],
    onSuccess: (response?: ServiceResponse) => void,
    onError: (error: OTLPExporterError) => void
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug('Shutdown already started. Cannot send objects');
      return;
    }

    const serviceRequest = this.convert(objects);
    const body = serializeItems(this.getServiceClientType(), serviceRequest);

    if (body) {
      sendWithXhr(
        new Blob([body], { type: 'application/x-protobuf' }),
        this.url,
        {
          ...this._headers,
          'Content-Type': 'application/x-protobuf',
          Accept: 'application/x-protobuf',
        },
        this.timeoutMillis,
        response => {
          if (response.contentType === 'application/x-protobuf') {
            try {
              if (response) {
                const serviceResponse = deserializeItems(
                  this.getServiceClientType(),
                  response.data
                );
                const stringResponse = JSON.stringify(serviceResponse);
                diag.warn(stringResponse);
              }
            } catch (err) {
              diag.warn(err);
            }
          }
          onSuccess();
        },
        onError
      );
    } else {
      onError(new OTLPExporterError('No proto'));
    }
  }

  abstract getServiceClientType(): ServiceClientType;
}
