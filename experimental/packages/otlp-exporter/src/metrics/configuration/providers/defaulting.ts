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

import { VERSION } from '../../../version';
import { OtlpProtoMetricsConfiguration } from '../types';
import { CumulativeTemporalitySelector } from '../temporality-selectors';
import { IConfigurationProvider } from '../../../common/configuration/provider';

// Specification defines 10 seconds.
const DEFAULT_TIMEOUT = 10000;
// Non-specified default limit concurrent exports.
const DEFAULT_CONCURRENCY_LIMIT = Infinity;
// Specification defines OTLP/HTTP default URL to be http://localhost:4318
const DEFAULT_HTTP_METRICS_URL = 'http://localhost:4318/v1/metrics';
const DEFAULT_COMPRESSION = 'none';
const DEFAULT_TEMPORALITY_SELECTOR = CumulativeTemporalitySelector;

export class DefaultingOtlpProtoMetricsConfigurationProvider
  implements IConfigurationProvider<OtlpProtoMetricsConfiguration>
{
  /**
   * @param _userProvidedConfiguration Hard-coded configuration options provided by the user.
   * @param _fallbackConfiguration Fallback to use when the _userProvidedConfiguration does not specify an option.
   */
  constructor(
    private _userProvidedConfiguration: Partial<OtlpProtoMetricsConfiguration>,
    private _fallbackConfiguration: Partial<OtlpProtoMetricsConfiguration>
  ) {}

  private determineUrl(): string {
    return (
      this._userProvidedConfiguration.url ??
      this._fallbackConfiguration.url ??
      DEFAULT_HTTP_METRICS_URL
    );
  }

  private determineHeaders(): Record<string, string> {
    const requiredHeaders = {
      'User-Agent': `OTel-OTLP-Exporter-JavaScript/${VERSION}`,
    };
    const headers = {};

    // add fallback ones first
    if (this._fallbackConfiguration.headers != null) {
      Object.assign(headers, this._fallbackConfiguration.headers);
    }

    // override with user-provided ones
    if (this._userProvidedConfiguration.headers != null) {
      Object.assign(headers, this._userProvidedConfiguration.headers);
    }

    // override required ones before exiting.
    return Object.assign(headers, requiredHeaders);
  }

  private determineCompression(): 'gzip' | 'none' {
    return (
      this._userProvidedConfiguration.compression ??
      this._fallbackConfiguration.compression ??
      DEFAULT_COMPRESSION
    );
  }

  private determineTimeoutMillis() {
    const timeoutMillis =
      this._userProvidedConfiguration.timeoutMillis ??
      this._fallbackConfiguration.timeoutMillis ??
      DEFAULT_TIMEOUT;

    if (
      !Number.isNaN(timeoutMillis) &&
      Number.isFinite(timeoutMillis) &&
      timeoutMillis > 0
    ) {
      return timeoutMillis;
    }
    throw new Error(
      `Configuration: timeoutMillis is invalid, expected number greater than 0 (actual: ${timeoutMillis})`
    );
  }

  provide(): OtlpProtoMetricsConfiguration {
    const concurrencyLimit =
      this._userProvidedConfiguration.concurrencyLimit ??
      this._fallbackConfiguration.concurrencyLimit ??
      DEFAULT_CONCURRENCY_LIMIT;
    const temporalitySelector =
      this._userProvidedConfiguration.temporalitySelector ??
      this._fallbackConfiguration.temporalitySelector ??
      DEFAULT_TEMPORALITY_SELECTOR;
    return {
      url: this.determineUrl(),
      headers: this.determineHeaders(),
      compression: this.determineCompression(),
      timeoutMillis: this.determineTimeoutMillis(),
      concurrencyLimit,
      temporalitySelector,
    };
  }
}
