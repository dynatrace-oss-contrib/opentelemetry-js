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
import { DefaultingOtlpHttpConfigurationProvider } from '../../../../src/common/http/configuration/defaulting-provider';
import { OtlpHttpConfiguration } from '../../../../src/common/http/configuration/configuration';

describe('defaulting configuration provider', function () {
  const testDefaults: OtlpHttpConfiguration = {
    url: 'default-url',
    timeoutMillis: 1,
    compression: 'none',
    concurrencyLimit: 2,
    headers: { 'User-Agent': 'default-user-agent' },
  };

  describe('headers', function () {
    it('merges headers instead of overriding', function () {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {
          headers: { foo: 'user' },
        },
        {
          headers: { foo: 'fallback', bar: 'fallback' },
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.headers, {
        'User-Agent': 'default-user-agent',
        foo: 'user',
        bar: 'fallback',
      });
    });
    it('does not default header override', function () {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {
          headers: { 'User-Agent': 'custom' },
        },
        {
          headers: { 'User-Agent': 'custom-fallback' },
        },
        {
          url: 'default-url',
          timeoutMillis: 1,
          compression: 'none',
          concurrencyLimit: 2,
          headers: { 'User-Agent': 'default-user-agent' },
        }
      );
      const config = provider.provide();
      assert.deepEqual(config.headers, {
        'User-Agent': 'default-user-agent',
      });
    });
  });

  describe('url', function () {
    it('uses user provided url over fallback', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {
          url: 'https://example.com/user-provided',
        },
        {
          url: 'https://example.com/fallback',
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.url, 'https://example.com/user-provided');
    });
    it('uses fallback url over default', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {
          url: 'https://example.com/fallback',
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.url, 'https://example.com/fallback');
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {},
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.url, testDefaults.url);
    });
  });

  describe('timeout', function () {
    it('uses user provided timeout over fallback', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {
          timeoutMillis: 222,
        },
        {
          timeoutMillis: 333,
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.timeoutMillis, 222);
    });
    it('uses fallback timeout over default', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {
          timeoutMillis: 444,
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.timeoutMillis, 444);
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {},
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.timeoutMillis, testDefaults.timeoutMillis);
    });

    it('throws when value is negative', function () {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        { timeoutMillis: -1 },
        {},
        testDefaults
      );

      assert.throws(() => provider.provide());
    });
  });

  describe('compression', function () {
    it('uses user provided compression over fallback', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {
          compression: 'gzip',
        },
        {
          compression: 'none',
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.compression, 'gzip');
    });
    it('uses fallback compression over default', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {
          compression: 'gzip',
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.compression, 'gzip');
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {},
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.compression, testDefaults.compression);
    });
  });

  describe('concurrency limit', function () {
    it('uses user provided limit over fallback', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {
          concurrencyLimit: 20,
        },
        {
          concurrencyLimit: 40,
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.concurrencyLimit, 20);
    });
    it('uses fallback limit over default', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {
          concurrencyLimit: 50,
        },
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.concurrencyLimit, 50);
    });
    it('uses default if none other are specified', () => {
      const provider = new DefaultingOtlpHttpConfigurationProvider(
        {},
        {},
        testDefaults
      );
      const config = provider.provide();
      assert.deepEqual(config.concurrencyLimit, testDefaults.concurrencyLimit);
    });
  });
});
