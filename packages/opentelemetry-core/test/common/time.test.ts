/*!
 * Copyright 2019, OpenTelemetry Authors
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
import { otperformance as performance } from '../../src/platform';
import * as sinon from 'sinon';
import * as types from '@opentelemetry/api';
import {
  hrTime,
  timeInputToHrTime,
  hrTimeDuration,
  hrTimeToNanoseconds,
  hrTimeToMilliseconds,
  hrTimeToMicroseconds,
  hrTimeToTimeStamp,
  isTimeInput,
  updateOffset,
} from '../../src/common/time';

describe('time', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    updateOffset(0)
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#hrTime', () => {
    it('should return hrtime now', () => {
      sandbox.stub(performance, 'timeOrigin').value(11.5);
      sandbox.stub(performance, 'now').callsFake(() => 11.3);
      sandbox.stub(Date, "now").returns(11.5 + 11.3)

      const output = hrTime();
      assert.deepStrictEqual(output, [0, 22800000]);
    });

    it('should calculate offsets when the performance timer is behind the system clock', () => {
      sandbox.stub(performance, 'timeOrigin').value(11.5);
      sandbox.stub(performance, 'now').callsFake(() => 11.3);
      sandbox.stub(Date, "now").returns(11.5 + 11.3 + 2000)

      const output = hrTime();
      assert.deepStrictEqual(output, [2, 22800000]);
    })

    it('should handle nanosecond overflow', () => {
      sandbox.stub(performance, 'timeOrigin').value(11.5);
      sandbox.stub(performance, 'now').callsFake(() => 11.6);
      sandbox.stub(Date, "now").returns(11.5 + 11.6)

      const output = hrTime();
      assert.deepStrictEqual(output, [0, 23100000]);
    });

    describe('when timeOrigin is not available', () => {
      it('should use the performance.timing.fetchStart as a fallback', () => {
        sandbox.stub(Date, "now").returns(11.5 + 11.3)
        Object.defineProperty(performance, 'timing', {
          writable: true,
          value: {
            fetchStart: 11.5,
          },
        });

        sandbox.stub(performance, 'timeOrigin').value(undefined);
        sandbox.stub(performance, 'now').callsFake(() => 11.3);

        const output = hrTime();
        assert.deepStrictEqual(output, [0, 22800000]);
      });
    });
  });

  describe('#timeInputToHrTime', () => {
    it('should convert Date hrTime', () => {
      const timeInput = new Date();
      const output = timeInputToHrTime(timeInput);
      assert.deepStrictEqual(output, [timeInput.getTime(), 0]);
    });

    it('should convert epoch milliseconds hrTime', () => {
      const timeInput = Date.now();
      const output = timeInputToHrTime(timeInput);
      assert.deepStrictEqual(output[0], Math.trunc(timeInput / 1000));
    });

    it('should convert performance.now() hrTime', () => {
      sandbox.stub(performance, 'timeOrigin').value(111.5);

      const timeInput = 11.9;
      const output = timeInputToHrTime(timeInput);

      assert.deepStrictEqual(output, [0, 123400000]);
    });

    it('should not convert hrtime hrTime', () => {
      sandbox.stub(performance, 'timeOrigin').value(111.5);

      const timeInput: [number, number] = [3138971, 245466222];
      const output = timeInputToHrTime(timeInput);

      assert.deepStrictEqual(timeInput, output);
    });
  });

  describe('#hrTimeDuration', () => {
    it('should return duration', () => {
      const startTime: types.HrTime = [22, 400000000];
      const endTime: types.HrTime = [32, 800000000];

      const output = hrTimeDuration(startTime, endTime);
      assert.deepStrictEqual(output, [10, 400000000]);
    });

    it('should handle nanosecond overflow', () => {
      const startTime: types.HrTime = [22, 400000000];
      const endTime: types.HrTime = [32, 200000000];

      const output = hrTimeDuration(startTime, endTime);
      assert.deepStrictEqual(output, [9, 800000000]);
    });
  });

  describe('#hrTimeToTimeStamp', () => {
    it('should return timestamp', () => {
      const time: types.HrTime = [1573513121, 123456];

      const output = hrTimeToTimeStamp(time);
      assert.deepStrictEqual(output, '2019-11-11T22:58:41.000123456Z');
    });
  });

  describe('#hrTimeToNanoseconds', () => {
    it('should return nanoseconds', () => {
      const output = hrTimeToNanoseconds([1, 200000000]);
      assert.deepStrictEqual(output, 1200000000);
    });
  });

  describe('#hrTimeToMilliseconds', () => {
    it('should return milliseconds', () => {
      const output = hrTimeToMilliseconds([1, 200000000]);
      assert.deepStrictEqual(output, 1200);
    });
  });

  describe('#hrTimeToMicroeconds', () => {
    it('should return microseconds', () => {
      const output = hrTimeToMicroseconds([1, 200000000]);
      assert.deepStrictEqual(output, 1200000);
    });
  });
  describe('#isTimeInput', () => {
    it('should return true for a number', () => {
      assert.strictEqual(isTimeInput(12), true);
    });
    it('should return true for a date', () => {
      assert.strictEqual(isTimeInput(new Date()), true);
    });
    it('should return true for an array with 2 elements type number', () => {
      assert.strictEqual(isTimeInput([1, 1]), true);
    });
    it('should return FALSE for different cases for an array ', () => {
      assert.strictEqual(isTimeInput([1, 1, 1]), false);
      assert.strictEqual(isTimeInput([1]), false);
      assert.strictEqual(isTimeInput([1, 'a']), false);
    });
    it('should return FALSE for a string', () => {
      assert.strictEqual(isTimeInput('a'), false);
    });
    it('should return FALSE for an object', () => {
      assert.strictEqual(isTimeInput({}), false);
    });
    it('should return FALSE for a null', () => {
      assert.strictEqual(isTimeInput(null), false);
    });
    it('should return FALSE for undefined', () => {
      assert.strictEqual(isTimeInput(undefined), false);
    });
  });
});
