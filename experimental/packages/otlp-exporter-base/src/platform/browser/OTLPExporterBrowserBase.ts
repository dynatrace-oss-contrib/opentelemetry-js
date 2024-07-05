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

import { OTLPExporterBase } from '../../OTLPExporterBase';
import { OTLPExporterConfigBase, OTLPExporterError } from '../../types';
import { parseHeaders } from '../../util';
import { diag } from '@opentelemetry/api';
import { getEnv, baggageUtils } from '@opentelemetry/core';
import { ISerializer } from '@opentelemetry/otlp-transformer';
import { IExporterTransport } from '../../exporter-transport';
import { createXhrTransport } from './xhr-transport';
import { createSendBeaconTransport } from './send-beacon-transport';

/**
 * Collector Metric Exporter abstract base class
 */
export abstract class OTLPExporterBrowserBase<
  ExportItem,
  ServiceResponse,
> extends OTLPExporterBase<OTLPExporterConfigBase, ExportItem> {
  private _useXHR: boolean = false;
  private _serializer: ISerializer<ExportItem[], ServiceResponse>;
  private _transport: IExporterTransport;

  /**
   * @param config
   * @param serializer
   * @param contentType
   */
  constructor(
    config: OTLPExporterConfigBase = {},
    serializer: ISerializer<ExportItem[], ServiceResponse>,
    contentType: string
  ) {
    super(config);
    this._serializer = serializer;
    this._useXHR =
      !!config.headers || typeof navigator.sendBeacon !== 'function';
    if (this._useXHR) {
      this._transport = createXhrTransport({
        blobType: contentType,
        headers: Object.assign(
          {},
          parseHeaders(config.headers),
          baggageUtils.parseKeyPairsIntoRecord(
            getEnv().OTEL_EXPORTER_OTLP_HEADERS
          )
        ),
        url: this.url,
        timeoutMillis: this.timeoutMillis,
      });
    } else {
      this._transport = createSendBeaconTransport({
        url: this.url,
        blobType: contentType,
      });
    }
  }

  onInit(): void {}

  onShutdown(): void {}

  send(
    objects: ExportItem[],
    onSuccess: () => void,
    onError: (error: OTLPExporterError) => void
  ): void {
    if (this._shutdownOnce.isCalled) {
      diag.debug('Shutdown already started. Cannot send objects');
      return;
    }

    const data = this._serializer.serializeRequest(objects);

    if (data == null) {
      onError(new Error('Could not serialize message'));
      return;
    }

    const promise = this._transport.send(data).then(response => {
      if (response.status === 'success') {
        onSuccess();
        return;
      }
      if (response.status === 'failure' && response.error) {
        onError(response.error);
      }
      onError(new OTLPExporterError('Export failed with unknown error'));
    }, onError);

    this._sendingPromises.push(promise);
    const popPromise = () => {
      const index = this._sendingPromises.indexOf(promise);
      this._sendingPromises.splice(index, 1);
    };
    promise.then(popPromise, popPromise);
  }
}
