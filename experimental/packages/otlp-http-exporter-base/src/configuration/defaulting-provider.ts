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

import { VERSION } from '../version';
import { OtlpHttpConfiguration } from './configuration';
import { IConfigurationProvider } from '@opentelemetry/otlp-exporter-base';

// Specification defines 10 seconds.
export const DEFAULT_TIMEOUT = 10000;
// Non-specified default limit concurrent exports.
export const DEFAULT_CONCURRENCY_LIMIT = 30;
// Specification defines OTLP/HTTP default URL to be http://localhost:4318
export const DEFAULT_COMPRESSION = 'none';
// TODO: require accept, content-type?
export const DEFAULT_HEADERS = {
  'User-Agent': `OTel-OTLP-Exporter-JavaScript/${VERSION}`,
};

export class DefaultingOtlpHttpConfigurationProvider
  implements IConfigurationProvider<OtlpHttpConfiguration>
{
  /**
   * @param _userProvidedConfiguration Hard-coded configuration options provided by the user.
   * @param _fallbackConfiguration Fallback to use when the _userProvidedConfiguration does not specify an option.
   * @param _defaultConfiguration The defaults as defined by the exporter specification
   */
  constructor(
    private _userProvidedConfiguration: Partial<OtlpHttpConfiguration>,
    private _fallbackConfiguration: Partial<OtlpHttpConfiguration>,
    private _defaultConfiguration: OtlpHttpConfiguration
  ) {}

  private determineUrl(): string {
    return (
      this._userProvidedConfiguration.url ??
      this._fallbackConfiguration.url ??
      this._defaultConfiguration.url
    );
  }

  private determineHeaders(): Record<string, string> {
    const requiredHeaders = {
      ...this._defaultConfiguration.headers,
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
      this._defaultConfiguration.compression
    );
  }

  private determineConcurrencyLimit(): number {
    return (
      this._userProvidedConfiguration.concurrencyLimit ??
      this._fallbackConfiguration.concurrencyLimit ??
      this._defaultConfiguration.concurrencyLimit
    );
  }

  private determineTimeoutMillis() {
    const timeoutMillis =
      this._userProvidedConfiguration.timeoutMillis ??
      this._fallbackConfiguration.timeoutMillis ??
      this._defaultConfiguration.timeoutMillis;

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

  provide(): OtlpHttpConfiguration {
    return {
      url: this.determineUrl(),
      headers: this.determineHeaders(),
      compression: this.determineCompression(),
      timeoutMillis: this.determineTimeoutMillis(),
      concurrencyLimit: this.determineConcurrencyLimit(),
    };
  }
}
