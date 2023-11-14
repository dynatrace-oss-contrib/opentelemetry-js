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

import {
  CumulativeTemporalitySelector,
  DeltaTemporalitySelector,
  LowMemoryTemporalitySelector,
} from '../temporality-selectors';
import { baggageUtils } from '@opentelemetry/core';
import { OtlpProtoMetricsConfiguration } from '../types';
import { IConfigurationProvider } from '../../../common/configuration/provider';

export class EnvironmentOtlpProtoMetricsConfigurationProvider
  implements IConfigurationProvider<Partial<OtlpProtoMetricsConfiguration>>
{
  private determineNonSpecificUrl() {
    const envUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (envUrl == null) {
      return undefined;
    }
    return appendResourcePathToUrl(envUrl, 'v1/metrics');
  }

  private determineUrl() {
    const envUrl = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
    if (envUrl == null) {
      return undefined;
    }
    return appendRootPathToUrlIfNeeded(envUrl);
  }

  private determineTemporalityPreference() {
    const envPreference =
      process.env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE;

    if (envPreference == null) {
      return undefined;
    }

    const configuredTemporality = envPreference.trim().toLowerCase();

    if (configuredTemporality === 'cumulative') {
      return CumulativeTemporalitySelector;
    }
    if (configuredTemporality === 'delta') {
      return DeltaTemporalitySelector;
    }
    if (configuredTemporality === 'lowmemory') {
      return LowMemoryTemporalitySelector;
    }

    diag.warn(
      `Configuration: OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE is set to '${envPreference}', but only 'cumulative', 'delta', and 'lowmemory' are allowed.`
    );
    return undefined;
  }

  private determineHeaders() {
    const envHeaders = process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS;
    const envNonSignalSpecificHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;
    if (envHeaders == null && envNonSignalSpecificHeaders == null) {
      return undefined;
    }

    // headers are combined instead, with the non-specific headers taking precedence over the more specific ones.
    return Object.assign(
      {},
      baggageUtils.parseKeyPairsIntoRecord(envNonSignalSpecificHeaders),
      baggageUtils.parseKeyPairsIntoRecord(envHeaders)
    );
  }

  private parseTimeout(timeoutEnvVar: string) {
    const envTimeout = process.env[timeoutEnvVar];
    if (envTimeout != null) {
      const definedTimeout = Number(envTimeout);
      if (
        !Number.isNaN(definedTimeout) &&
        Number.isFinite(definedTimeout) &&
        definedTimeout > 0
      ) {
        return definedTimeout;
      }
      diag.warn(
        `Configuration: ${timeoutEnvVar} is invalid, expected number greater than 0 (actual: ${envTimeout})`
      );
    }
    return undefined;
  }

  private determineTimeout() {
    const specificTimeout = this.parseTimeout(
      'OTEL_EXPORTER_OTLP_METRICS_TIMEOUT'
    );
    const nonSpecificTimeout = this.parseTimeout('OTEL_EXPORTER_OTLP_TIMEOUT');

    return specificTimeout ?? nonSpecificTimeout;
  }

  private parseCompression(compressionEnvVar: string) {
    const compression = process.env[compressionEnvVar];

    if (
      compression == null ||
      compression === 'none' ||
      compression === 'gzip'
    ) {
      return compression;
    }
    diag.warn(
      `Configuration: ${compressionEnvVar} is invalid, expected 'none' or 'gzip' (actual: '${compression}')`
    );
    return undefined;
  }

  private determineCompression() {
    const specificCompression = this.parseCompression(
      'OTEL_EXPORTER_OTLP_METRICS_COMPRESSION'
    );
    const nonSpecificCompression = this.parseCompression(
      'OTEL_EXPORTER_OTLP_COMPRESSION'
    );

    return specificCompression ?? nonSpecificCompression;
  }

  provide(): Partial<OtlpProtoMetricsConfiguration> {
    return {
      url: this.determineUrl() ?? this.determineNonSpecificUrl(),
      temporalitySelector: this.determineTemporalityPreference(),
      timeoutMillis: this.determineTimeout(),
      headers: this.determineHeaders(),
      compression: this.determineCompression(),
    };
  }
}

function appendRootPathToUrlIfNeeded(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // This will automatically append '/' if there's no root path.
    return parsedUrl.toString();
  } catch {
    diag.warn(
      `Configuration: Could not parse export URL: '${url}', falling back to undefined`
    );
    return url;
  }
}

function appendResourcePathToUrl(url: string, path: string): string {
  if (!url.endsWith('/')) {
    url = url + '/';
  }
  return url + path;
}
