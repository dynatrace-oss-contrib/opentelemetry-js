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
import { diag } from '@opentelemetry/api';
import { getEnv, globalErrorHandler } from '@opentelemetry/core';
import * as path from 'path';
import { OTLPGRPCExporterNodeBase } from './OTLPGRPCExporterNodeBase';
import { URL } from 'url';
import * as fs from 'fs';
import {
  GRPCQueueItem,
  OTLPGRPCExporterConfigNode,
  ServiceClientType,
} from './types';
import {
  CompressionAlgorithm,
  ExportServiceError,
  OTLPExporterError,
} from '@opentelemetry/otlp-exporter-base';

import { MetricExportServiceClient } from './MetricsExportServiceClient';
import { TraceExportServiceClient } from './TraceExportServiceClient';
import { LogsExportServiceClient } from './LogsExportServiceClient';

export const DEFAULT_COLLECTOR_URL = 'http://localhost:4317';

export interface IGrpcExporterConfigurationProvider {
  getInsecure(): boolean;
  getRootCertificate(): Buffer | undefined;
  getClientCertificate(): Buffer | undefined;
  getClientKey(): Buffer | undefined;
  getCompression(
    config?: OTLPGRPCExporterConfigNode
  ): CompressionAlgorithm | undefined;
}

type GrpcExporterEnvHandler = {
  clientKey: () => string | undefined;
  compression: () => string | undefined;
  insecure: () => string | undefined;
  rootCertificate: () => string | undefined;
  clientCertificate: () => string | undefined;
};

const baseHandler: GrpcExporterEnvHandler = {
  clientKey: () => getEnv().OTEL_EXPORTER_OTLP_CLIENT_KEY,
  compression: () => getEnv().OTEL_EXPORTER_OTLP_COMPRESSION,
  insecure: () => getEnv().OTEL_EXPORTER_OTLP_INSECURE,
  rootCertificate: () => getEnv().OTEL_EXPORTER_OTLP_CERTIFICATE,
  clientCertificate: () => getEnv().OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE,
};

export const traceHandler: GrpcExporterEnvHandler = {
  clientKey: () => getEnv().OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY,
  compression: () => getEnv().OTEL_EXPORTER_OTLP_TRACES_COMPRESSION,
  insecure: () => getEnv().OTEL_EXPORTER_OTLP_TRACES_INSECURE,
  rootCertificate: () => getEnv().OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE,
  clientCertificate: () =>
    getEnv().OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE,
};

export function createConfigurationProvider(
  envVarHandler: GrpcExporterEnvHandler
) {
  return new EnvironmentGrpcExporterConfigurationProvider(envVarHandler);
}

class EnvironmentGrpcExporterConfigurationProvider
  implements IGrpcExporterConfigurationProvider
{
  private _baseEnvVarHandler: GrpcExporterEnvHandler;
  constructor(private _signalSpecificEnvVarHandler: GrpcExporterEnvHandler) {
    this._baseEnvVarHandler = baseHandler;
  }

  getInsecure() {
    const definedInsecure =
      this._baseEnvVarHandler.insecure() ||
      this._signalSpecificEnvVarHandler.insecure();

    if (definedInsecure) {
      return definedInsecure.toLowerCase() === 'true';
    } else {
      return false;
    }
  }

  getClientCertificate(): Buffer | undefined {
    const clientChain =
      this._baseEnvVarHandler.clientCertificate() ||
      this._signalSpecificEnvVarHandler.clientCertificate();

    if (clientChain) {
      try {
        return fs.readFileSync(path.resolve(process.cwd(), clientChain));
      } catch {
        diag.warn('Failed to read client certificate chain file');
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  getCompression(
    config?: OTLPGRPCExporterConfigNode
  ): CompressionAlgorithm | undefined {
    if (config?.compression) {
      return config?.compression;
    } else {
      const definedCompression =
        this._baseEnvVarHandler.compression() ||
        this._signalSpecificEnvVarHandler.compression();

      return definedCompression === 'gzip'
        ? CompressionAlgorithm.GZIP
        : CompressionAlgorithm.NONE;
    }
  }

  getRootCertificate(): Buffer | undefined {
    const rootCertificate =
      this._baseEnvVarHandler.rootCertificate() ||
      this._signalSpecificEnvVarHandler.rootCertificate();

    if (rootCertificate) {
      try {
        return fs.readFileSync(path.resolve(process.cwd(), rootCertificate));
      } catch {
        diag.warn('Failed to read root certificate file');
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  getClientKey(): Buffer | undefined {
    const clientKey =
      this._baseEnvVarHandler.clientKey() ||
      this._signalSpecificEnvVarHandler.clientKey();

    if (clientKey) {
      try {
        return fs.readFileSync(path.resolve(process.cwd(), clientKey));
      } catch {
        diag.warn('Failed to read client certificate private key file');
        return undefined;
      }
    } else {
      return undefined;
    }
  }
}

export function onInit<ExportItem, ServiceRequest>(
  collector: OTLPGRPCExporterNodeBase<ExportItem, ServiceRequest>,
  config: OTLPGRPCExporterConfigNode,
  configProvider: IGrpcExporterConfigurationProvider
): void {
  collector.grpcQueue = [];

  const credentials: grpc.ChannelCredentials = configureSecurity(
    config.credentials,
    collector.getUrlFromConfig(config),
    configProvider
  );

  try {
    if (collector.getServiceClientType() === ServiceClientType.SPANS) {
      const client = new TraceExportServiceClient(collector.url, credentials, {
        'grpc.default_compression_algorithm': toGrpcCompression(
          configProvider.getCompression(config)
        ).valueOf(),
      });

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      collector.serviceClient = client;
    } else if (collector.getServiceClientType() === ServiceClientType.METRICS) {
      const client = new MetricExportServiceClient(collector.url, credentials, {
        'grpc.default_compression_algorithm': toGrpcCompression(
          configProvider.getCompression(config)
        ).valueOf(),
      });

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      collector.serviceClient = client;
    } else if (collector.getServiceClientType() === ServiceClientType.LOGS) {
      const client = new LogsExportServiceClient(collector.url, credentials, {
        'grpc.default_compression_algorithm': toGrpcCompression(
          configProvider.getCompression(config)
        ).valueOf(),
      });

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      collector.serviceClient = client;
    }
  } catch (err) {
    globalErrorHandler(err);
  }
  if (collector.grpcQueue.length > 0) {
    const queue = collector.grpcQueue.splice(0);
    queue.forEach((item: GRPCQueueItem<ExportItem>) => {
      collector.send(item.objects, item.onSuccess, item.onError);
    });
  }
}

export function send<ExportItem, ServiceRequest>(
  collector: OTLPGRPCExporterNodeBase<ExportItem, ServiceRequest>,
  objects: ExportItem[],
  onSuccess: () => void,
  onError: (error: OTLPExporterError) => void
): void {
  if (collector.serviceClient) {
    const serviceRequest = collector.convert(objects);
    const deadline = Date.now() + collector.timeoutMillis;

    collector.serviceClient.export(
      serviceRequest,
      collector.metadata || new grpc.Metadata(),
      { deadline: deadline },
      (err: ExportServiceError) => {
        if (err) {
          diag.error('Service request', serviceRequest);
          onError(err);
        } else {
          diag.debug('Objects sent');
          onSuccess();
        }
      }
    );
  } else {
    collector.grpcQueue.push({
      objects,
      onSuccess,
      onError,
    });
  }
}

export function validateAndNormalizeUrl(url: string): string {
  const hasProtocol = url.match(/^([\w]{1,8}):\/\//);
  if (!hasProtocol) {
    url = `https://${url}`;
  }
  const target = new URL(url);
  if (target.pathname && target.pathname !== '/') {
    diag.warn(
      'URL path should not be set when using grpc, the path part of the URL will be ignored.'
    );
  }
  if (target.protocol !== '' && !target.protocol?.match(/^(http)s?:$/)) {
    diag.warn('URL protocol should be http(s)://. Using http://.');
  }
  return target.host;
}

export function configureSecurity(
  credentials: grpc.ChannelCredentials | undefined,
  endpoint: string,
  configProvider: IGrpcExporterConfigurationProvider
): grpc.ChannelCredentials {
  let insecure: boolean;

  if (credentials) {
    return credentials;
  } else if (endpoint.startsWith('https://')) {
    insecure = false;
  } else if (
    endpoint.startsWith('http://') ||
    endpoint === DEFAULT_COLLECTOR_URL
  ) {
    insecure = true;
  } else {
    insecure = configProvider.getInsecure();
  }

  if (insecure) {
    return grpc.credentials.createInsecure();
  } else {
    return useSecureConnection(configProvider);
  }
}

export function useSecureConnection(
  configProvider: IGrpcExporterConfigurationProvider
): grpc.ChannelCredentials {
  const rootCertPath = configProvider.getRootCertificate();
  const privateKeyPath = configProvider.getClientKey();
  const certChainPath = configProvider.getClientCertificate();

  return grpc.credentials.createSsl(
    rootCertPath,
    privateKeyPath,
    certChainPath
  );
}

function toGrpcCompression(
  compression?: CompressionAlgorithm
): GrpcCompressionAlgorithm {
  if (compression === CompressionAlgorithm.NONE)
    return GrpcCompressionAlgorithm.NONE;
  else if (compression === CompressionAlgorithm.GZIP)
    return GrpcCompressionAlgorithm.GZIP;
  return GrpcCompressionAlgorithm.NONE;
}

/**
 * These values are defined by grpc client
 */
export enum GrpcCompressionAlgorithm {
  NONE = 0,
  GZIP = 2,
}
