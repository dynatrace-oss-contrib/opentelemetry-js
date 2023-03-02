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
import { createMetricDescriptor, InstrumentType } from '../src/Descriptor';

describe('MetricDescriptor', () => {
  describe('createDescriptor', () => {
    for (const val of [null, undefined]) {
      it(`should interpret an empty unit value as a blank string (${val})`, () => {
        const result = createMetricDescriptor(
          'example',
          InstrumentType.COUNTER,
          {
            unit: val as any,
          }
        );
        assert.strictEqual(result.unit, '');
      });
    }
  });
});