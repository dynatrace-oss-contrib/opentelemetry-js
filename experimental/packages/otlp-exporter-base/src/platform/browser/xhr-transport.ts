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

import { IExporterTransport } from '../../exporter-transport';
import { ExportResponse } from '../../export-response';
import { isExportRetryable, parseRetryAfterToMills } from '../../util';
import { diag } from '@opentelemetry/api';

export interface XhrRequestParameters {
  timeoutMillis: number;
  url: string;
  headers: Record<string, string>;
  /**
   * for instance 'application/x-protobuf'
   */
  blobType: string;
}

class XhrTransport implements IExporterTransport {
  constructor(private _parameters: XhrRequestParameters) {}

  send(data: Uint8Array): Promise<ExportResponse> {
    return new Promise<ExportResponse>(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = this._parameters.timeoutMillis;
      xhr.open('POST', this._parameters.url);
      Object.entries(this._parameters.headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });

      xhr.ontimeout = _ => {
        resolve({
          status: 'failure',
          error: new Error('XHR request timed out'),
        });
      };

      xhr.onreadystatechange = () => {
        if (xhr.status >= 200 && xhr.status <= 299) {
          diag.debug('XHR success');
          resolve({
            status: 'success',
          });
        } else if (xhr.status && isExportRetryable(xhr.status)) {
          resolve({
            status: 'retryable',
            retryInMillis: parseRetryAfterToMills(
              xhr.getResponseHeader('Retry-After')
            ),
          });
        } else {
          resolve({
            status: 'failure',
            error: new Error('XHR request failed with non-retryable status'),
          });
        }
      };

      xhr.onabort = () => {
        resolve({
          status: 'failure',
          error: new Error('XHR request aborted'),
        });
      };
      xhr.onerror = () => {
        resolve({
          status: 'failure',
          error: new Error('XHR request errored'),
        });
      };

      xhr.send(new Blob([data], { type: this._parameters.blobType }));
    });
  }
  shutdown() {
    // Intentionally left empty, nothing to do.
  }
}

/**
 * Creates an exporter transport that uses XHR to send the data
 * @param parameters applied to each request made by transport
 */
export function createXhrTransport(
  parameters: XhrRequestParameters
): IExporterTransport {
  return new XhrTransport(parameters);
}
