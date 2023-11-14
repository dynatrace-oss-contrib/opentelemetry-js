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
import { DefaultingOtlpProtoMetricsConfigurationProvider } from '../../../src/metrics/configuration/providers/defaulting';
import { VERSION } from '../../../src/version';
import {
  CumulativeTemporalitySelector,
  DeltaTemporalitySelector,
  LowMemoryTemporalitySelector,
} from '../../../src/metrics/configuration/temporality-selectors';

describe('defaulting configuration provider', function () {
  describe('headers', function () {
    it('merges headers instead of overriding', function () {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {
          headers: { foo: 'user' },
        },
        {
          headers: { foo: 'fallback', bar: 'fallback' },
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.headers, {
        'User-Agent': `OTel-OTLP-Exporter-JavaScript/${VERSION}`,
        foo: 'user',
        bar: 'fallback',
      });
    });
    it('overrides User-Agent', function () {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {
          headers: { 'User-Agent': 'custom' },
        },
        {
          headers: { 'User-Agent': 'custom-fallback' },
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.headers, {
        'User-Agent': `OTel-OTLP-Exporter-JavaScript/${VERSION}`,
      });
    });
  });

  describe('url', function () {
    it('uses user provided url over fallback', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {
          url: 'https://example.com/user-provided',
        },
        {
          url: 'https://example.com/fallback',
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.url, 'https://example.com/user-provided');
    });
    it('uses fallback url over default', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {
          url: 'https://example.com/fallback',
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.url, 'https://example.com/fallback');
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {}
      );
      const config = provider.provide();
      assert.deepEqual(config.url, 'http://localhost:4318/v1/metrics');
    });
  });

  describe('timeout', function () {
    it('uses user provided timeout over fallback', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {
          timeoutMillis: 222,
        },
        {
          timeoutMillis: 333,
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.timeoutMillis, 222);
    });
    it('uses fallback timeout over default', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {
          timeoutMillis: 444,
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.timeoutMillis, 444);
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {}
      );
      const config = provider.provide();
      assert.deepEqual(config.timeoutMillis, 10000);
    });

    it('throws when value is negative', function () {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        { timeoutMillis: -1 },
        {}
      );

      assert.throws(() => provider.provide());
    });
  });

  describe('compression', function () {
    it('uses user provided compression over fallback', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {
          compression: 'gzip',
        },
        {
          compression: 'none',
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.compression, 'gzip');
    });
    it('uses fallback compression over default', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {
          compression: 'gzip',
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.compression, 'gzip');
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {}
      );
      const config = provider.provide();
      assert.deepEqual(config.compression, 'none');
    });
  });

  describe('concurrency limit', function () {
    it('uses user provided limit over fallback', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {
          concurrencyLimit: 20,
        },
        {
          concurrencyLimit: 40,
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.concurrencyLimit, 20);
    });
    it('uses fallback limit over default', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {
          concurrencyLimit: 50,
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.concurrencyLimit, 50);
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {}
      );
      const config = provider.provide();
      assert.deepEqual(config.concurrencyLimit, Infinity);
    });
  });

  describe('temporality selector', function () {
    it('uses user provided selector over fallback', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {
          temporalitySelector: DeltaTemporalitySelector,
        },
        {
          temporalitySelector: LowMemoryTemporalitySelector,
        }
      );
      const config = provider.provide();
      assert.strictEqual(config.temporalitySelector, DeltaTemporalitySelector);
    });
    it('uses fallback selector over default', () => {
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
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
      const provider = new DefaultingOtlpProtoMetricsConfigurationProvider(
        {},
        {}
      );
      const config = provider.provide();
      assert.deepEqual(
        config.temporalitySelector,
        CumulativeTemporalitySelector
      );
    });
  });
});
