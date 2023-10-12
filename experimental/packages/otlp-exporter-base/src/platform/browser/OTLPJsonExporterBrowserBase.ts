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

import { OTLPExporterConfigBase } from '../../types';
import * as otlpTypes from '../../types';
import { sendWithBeacon, sendWithXhr } from './transport-util';
import { diag } from '@opentelemetry/api';
import { OTLPHttpExporterBrowserBase } from './OTLPHttpExporterBrowserBase';

/**
 * OTLP JSON Exporter abstract base class
 */
export abstract class OTLPJsonExporterBrowserBase<
  ExportItem,
  ServiceRequest,
> extends OTLPHttpExporterBrowserBase<ExportItem, ServiceRequest> {
  /**
   * @param config
   */
  constructor(config: OTLPExporterConfigBase = {}) {
    super(config);
  }

  send(
    items: ExportItem[],
    onSuccess: () => void,
    onError: (error: otlpTypes.OTLPExporterError) => void
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug('Shutdown already started. Cannot send objects');
      return;
    }
    const serviceRequest = this.convert(items);
    const body = JSON.stringify(serviceRequest);

    const promise = new Promise<void>((resolve, reject) => {
      if (this._useXHR) {
        sendWithXhr(
          body,
          this.url,
          this._headers,
          this.timeoutMillis,
          () => {
            resolve();
          },
          reject
        );
      } else {
        sendWithBeacon(
          body,
          this.url,
          { type: 'application/json' },
          resolve,
          reject
        );
      }
    }).then(onSuccess, onError);

    this.sendingQueue.pushPromise(promise);
  }
}
