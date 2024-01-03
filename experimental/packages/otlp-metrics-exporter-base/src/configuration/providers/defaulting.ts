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

import { MetricsConfiguration } from '../types';
import { CumulativeTemporalitySelector } from '../temporality-selectors';
import { IConfigurationProvider } from '@opentelemetry/otlp-exporter-base';

const DEFAULT_TEMPORALITY_SELECTOR = CumulativeTemporalitySelector;

/**
 * Handles merging user-provided, fallback, and default configurations for metrics-specific exporters.
 *
 * @experimental
 */
export class DefaultingMetricsConfigurationProvider
  implements IConfigurationProvider<MetricsConfiguration>
{
  /**
   * @param _userProvidedConfiguration Hard-coded configuration options provided by the user.
   * @param _fallbackConfiguration Fallback to use when the _userProvidedConfiguration does not specify an option.
   */
  constructor(
    private _userProvidedConfiguration: Partial<MetricsConfiguration>,
    private _fallbackConfiguration: Partial<MetricsConfiguration>
  ) {}

  provide(): MetricsConfiguration {
    return {
      temporalitySelector:
        this._userProvidedConfiguration.temporalitySelector ??
        this._fallbackConfiguration.temporalitySelector ??
        DEFAULT_TEMPORALITY_SELECTOR,
    };
  }
}
