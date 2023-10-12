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
import { OTLPExporterConfigBase } from '../../types';
import { parseHeaders } from '../../util';
import { getEnv, baggageUtils, _globalThis } from '@opentelemetry/core';

/**
 * Collector Metric Exporter abstract base class
 */
export abstract class OTLPHttpExporterBrowserBase<
  ExportItem,
  ServiceRequest,
> extends OTLPExporterBase<OTLPExporterConfigBase, ExportItem, ServiceRequest> {
  protected _headers: Record<string, string>;
  protected _useXHR: boolean = false;

  /**
   * @param config
   */
  constructor(config: OTLPExporterConfigBase = {}) {
    super(config);
    _globalThis.addEventListener('unload', this.shutdown);
    this._useXHR =
      !!config.headers || typeof navigator.sendBeacon !== 'function';
    if (this._useXHR) {
      this._headers = Object.assign(
        {},
        parseHeaders(config.headers),
        baggageUtils.parseKeyPairsIntoRecord(
          getEnv().OTEL_EXPORTER_OTLP_HEADERS
        )
      );
    } else {
      this._headers = {};
    }
  }

  onShutdown(): void {
    _globalThis.removeEventListener('unload', this.shutdown);
  }
}
