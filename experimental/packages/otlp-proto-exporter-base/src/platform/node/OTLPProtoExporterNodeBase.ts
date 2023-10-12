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
  OTLPExporterError,
  OTLPExporterNodeConfigBase,
  OTLPHttpExporterNodeBase,
} from '@opentelemetry/otlp-exporter-base';

type SendFn = <ExportItem, ServiceRequest, ServiceResponse>(
  collector: OTLPProtoExporterNodeBase<
    ExportItem,
    ServiceRequest,
    ServiceResponse
  >,
  serviceClientType: ServiceClientType,
  request: ServiceRequest,
  onSuccess: (response?: ServiceResponse) => void,
  onError: (error: OTLPExporterError) => void
) => Promise<void>;

/**
 * Collector Exporter abstract base class
 */
export abstract class OTLPProtoExporterNodeBase<
  ExportItem,
  ServiceRequest,
  ServiceResponse,
> extends OTLPHttpExporterNodeBase<ExportItem, ServiceRequest> {
  private _send!: SendFn;
  private readonly _converter: (items: ExportItem[]) => ServiceRequest;
  private _serviceClientType: ServiceClientType;

  constructor(
    config: OTLPExporterNodeConfigBase = {},
    serviceClientType: ServiceClientType,
    converter: (items: ExportItem[]) => ServiceRequest
  ) {
    super(config);
    this._converter = converter;
    this._serviceClientType = serviceClientType;
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
    if (!this._send) {
      // defer to next tick and lazy load to avoid loading protobufjs too early
      // and making this impossible to be instrumented
      setImmediate(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { sendAsync } = require('./transport-util');
        this._send = sendAsync;
        const promise = this._send(
          this,
          this._serviceClientType,
          this._converter(objects),
          onSuccess,
          onError
        );
        this.sendingQueue.pushPromise(promise);
      });
    } else {
      const promise = this._send(
        this,
        this._serviceClientType,
        this._converter(objects),
        onSuccess,
        onError
      );
      this.sendingQueue.pushPromise(promise);
    }
  }

  convert(objects: ExportItem[]): ServiceRequest {
    return this._converter(objects);
  }

  getServiceClientType(): ServiceClientType {
    return this._serviceClientType;
  }
}
