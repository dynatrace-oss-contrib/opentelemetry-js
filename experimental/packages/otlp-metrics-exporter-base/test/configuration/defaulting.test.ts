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

import * as assert from 'assert';
import {
  DefaultingMetricsConfigurationProvider,
  CumulativeTemporalitySelector,
  DeltaTemporalitySelector,
  LowMemoryTemporalitySelector,
} from '../../src';

describe('DefaultingMetricsConfigurationProvider', function () {
  describe('provide', function () {
    describe('temporality selector', function () {
      it('uses user-provided selector over fallback', () => {
        const provider = new DefaultingMetricsConfigurationProvider(
          {
            temporalitySelector: DeltaTemporalitySelector,
          },
          {
            temporalitySelector: LowMemoryTemporalitySelector,
          }
        );
        const config = provider.provide();
        assert.strictEqual(
          config.temporalitySelector,
          DeltaTemporalitySelector
        );
      });
      it('uses fallback selector over default', () => {
        const provider = new DefaultingMetricsConfigurationProvider(
          {},
          {
            temporalitySelector: LowMemoryTemporalitySelector,
          }
        );
        const config = provider.provide();
        assert.deepEqual(
          config.temporalitySelector,
          LowMemoryTemporalitySelector
        );
      });
      it('uses default if none other are specified', () => {
        const provider = new DefaultingMetricsConfigurationProvider({}, {});
        const config = provider.provide();
        assert.deepEqual(
          config.temporalitySelector,
          CumulativeTemporalitySelector
        );
      });
    });
  });
});
