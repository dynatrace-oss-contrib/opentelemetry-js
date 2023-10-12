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

import { OTLPExporterNodeConfigBase } from './types';
import { OTLPExporterError } from '../../types';
import {createHttpAgent, sendWithHttp} from './transport-util';
import { diag } from '@opentelemetry/api';
import { OTLPHttpExporterNodeBase } from './OTLPHttpExporterNodeBase';

/**
 * Collector Metric Exporter abstract base class
 */
export abstract class OTLPJsonExporterNodeBase<
  ExportItem,
  ServiceRequest,
> extends OTLPHttpExporterNodeBase<ExportItem, ServiceRequest> {
  constructor(config: OTLPExporterNodeConfigBase = {}) {
    super(config);
    this.agent = createHttpAgent(config);
  }

  send(
    objects: ExportItem[],
    onSuccess: () => void,
    onError: (error: OTLPExporterError) => void
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug('Shutdown already started. Cannot send objects');
      return;
    }
    const serviceRequest = this.convert(objects);

    const promise = new Promise<void>((resolve, reject) => {
      sendWithHttp(
        this,
        JSON.stringify(serviceRequest),
        'application/json',
        () => resolve(),
        reject
      );
    }).then(onSuccess, onError);

    this.sendingQueue.pushPromise(promise);
  }
}
