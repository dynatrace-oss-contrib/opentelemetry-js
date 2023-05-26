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
import { Metadata } from '@grpc/grpc-js';
import {
  GRPCQueueItem,
  OTLPGRPCExporterConfigNode,
  ServiceClient,
  ServiceClientType,
} from './types';
import {
  createConfigurationProvider,
  IGrpcExporterConfigurationProvider,
  logsHandler,
  metricsHandler,
  traceHandler,
  validateConfig,
} from './util';
import {
  OTLPExporterBase,
  OTLPExporterError,
} from '@opentelemetry/otlp-exporter-base';

/**
 * OTLP Exporter abstract base class
 */
export abstract class OTLPGRPCExporterNodeBase<
  ExportItem,
  ServiceRequest
> extends OTLPExporterBase<
  OTLPGRPCExporterConfigNode,
  ExportItem,
  ServiceRequest
> {
  grpcQueue: GRPCQueueItem<ExportItem>[] = [];
  metadata?: Metadata;
  serviceClient?: ServiceClient = undefined;
  private _send!: Function;
  private _configProvider: IGrpcExporterConfigurationProvider;

  constructor(config: OTLPGRPCExporterConfigNode = {}) {
    super(config);
    if (this.getServiceClientType() === ServiceClientType.SPANS) {
      this._configProvider = createConfigurationProvider(traceHandler);
    } else if (this.getServiceClientType() === ServiceClientType.METRICS) {
      this._configProvider = createConfigurationProvider(metricsHandler);
    } else {
      this._configProvider = createConfigurationProvider(logsHandler);
    }

    validateConfig(config, this._configProvider);

    // TODO: why even allow setting headers in gRPC config interface when it's not respected anyway?
    if (config.headers) {
      diag.warn('Headers cannot be set when using grpc');
    }
    this.metadata = this._configProvider.getMetadata(config);
  }

  private _sendPromise(
    objects: ExportItem[],
    onSuccess: () => void,
    onError: (error: OTLPExporterError) => void
  ): void {
    const promise = new Promise<void>((resolve, reject) => {
      this._send(this, objects, resolve, reject);
    }).then(onSuccess, onError);

    this._sendingPromises.push(promise);
    const popPromise = () => {
      const index = this._sendingPromises.indexOf(promise);
      this._sendingPromises.splice(index, 1);
    };
    promise.then(popPromise, popPromise);
  }

  onInit(config: OTLPGRPCExporterConfigNode): void {
    // defer to next tick and lazy load to avoid loading grpc too early
    // and making this impossible to be instrumented
    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { onInit } = require('./util');
      onInit(this, config, this._configProvider);
    });
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
    if (!this._send) {
      // defer to next tick and lazy load to avoid loading grpc too early
      // and making this impossible to be instrumented
      setImmediate(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { send } = require('./util');
        this._send = send;

        this._sendPromise(objects, onSuccess, onError);
      });
    } else {
      this._sendPromise(objects, onSuccess, onError);
    }
  }

  onShutdown(): void {
    if (this.serviceClient) {
      this.serviceClient.close();
    }
  }
  // TODO: unnecessary
  getDefaultUrl(_config: OTLPGRPCExporterConfigNode): string {
    return '';
  }

  abstract getServiceProtoPath(): string;
  abstract getServiceClientType(): ServiceClientType;
}
