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

/*
 * BSD 2-Clause License
 *
 * Copyright (c) 2013-2019, Forrest L Norvell
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/*
 *  Modified by OpenTelemetry Authors
 *  - renamed test file, adapted tests to use `assert` and `mocha`
 *  - aligned with style-guide
 */

'use strict';

const sinon = require('sinon');
const shimmer = require('../index.js');
const assert = require('assert');

let outsider = 0;

function counter() {
  return ++outsider;
}
function anticounter() {
  return --outsider;
}

const generator = {
  inc: counter,
};
Object.defineProperty(generator, 'dec', {
  value: anticounter,
  writable: true,
  configurable: true,
  enumerable: false,
});

describe('wrap', function () {
  it('should wrap safely', function () {
    assert.equal(counter, generator.inc, 'method is mapped to function');
    assert.doesNotThrow(function () {
      generator.inc();
    }, 'original function works');
    assert.equal(1, outsider, 'calls have side effects');

    let count = 0;
    function wrapper(original, name) {
      assert.equal(name, 'inc');
      return function () {
        count++;
        var returned = original.apply(this, arguments);
        count++;
        return returned;
      };
    }
    shimmer.wrap(generator, 'inc', wrapper);

    assert.ok(generator.inc.__wrapped, "function tells us it's wrapped");
    assert.equal(
      generator.inc.__original,
      counter,
      'original function is available'
    );
    assert.doesNotThrow(function () {
      generator.inc();
    }, 'wrapping works');
    assert.equal(2, count, 'both pre and post increments should have happened');
    assert.equal(2, outsider, 'original function has still been called');
    assert.ok(
      Object.prototype.propertyIsEnumerable.call(generator, 'inc'),
      'wrapped enumerable property is still enumerable'
    );
    assert.equal(
      Object.keys(generator.inc).length,
      0,
      'wrapped object has no additional properties'
    );

    shimmer.wrap(generator, 'dec', function (original) {
      return function () {
        return original.apply(this, arguments);
      };
    });

    assert.ok(
      !Object.prototype.propertyIsEnumerable.call(generator, 'dec'),
      'wrapped unenumerable property is still unenumerable'
    );
  });

  it('wrap called with no arguments', function () {
    const mock = sinon.expectation
      .create('logger')
      .withExactArgs('no original function undefined to wrap')
      .once();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.wrap();
    }, "wrapping with no arguments doesn't throw");

    assert.doesNotThrow(function () {
      mock.verify();
    }, 'logger was called with the expected message');
  });

  it('wrap called with module but nothing else', function () {
    const mock = sinon.expectation
      .create('logger')
      .withExactArgs('no original function undefined to wrap')
      .once();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.wrap(generator);
    }, "wrapping with only 1 argument doesn't throw");

    assert.doesNotThrow(function () {
      mock.verify();
    }, 'logger was called with the expected message');
  });

  it('wrap called with original but no wrapper', function () {
    const mock = sinon.expectation.create('logger').twice();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.wrap(generator, 'inc');
    }, "wrapping with only original method doesn't throw");

    assert.doesNotThrow(function () {
      mock.verify();
    }, 'logger was called with the expected message');
  });

  it('wrap called with non-function original', function () {
    const mock = sinon.expectation
      .create('logger')
      .withExactArgs('original object and wrapper must be functions')
      .once();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.wrap({ orange: 'slices' }, 'orange', function () {});
    }, "wrapping non-function original doesn't throw");

    assert.doesNotThrow(function () {
      mock.verify();
    }, 'logger was called with the expected message');
  });

  it('wrap called with non-function wrapper', function () {
    const mock = sinon.expectation
      .create('logger')
      .withArgs('original object and wrapper must be functions')
      .once();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.wrap({ orange: function () {} }, 'orange', 'hamchunx');
    }, "wrapping with non-function wrapper doesn't throw");

    assert.doesNotThrow(function () {
      mock.verify();
    }, 'logger was called with the expected message');
  });
});
