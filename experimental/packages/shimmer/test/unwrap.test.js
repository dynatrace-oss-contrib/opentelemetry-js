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

const generator = {
  inc: counter,
};

describe('unwrap', function () {
  it('should unwrap safely', function () {
    assert.equal(
      counter,
      generator.inc,
      'basic function equality testing should work'
    );
    assert.doesNotThrow(function () {
      generator.inc();
    });
    assert.equal(1, outsider, 'calls have side effects');

    function wrapper(original) {
      return function () {
        return original.apply(this, arguments);
      };
    }
    shimmer.wrap(generator, 'inc', wrapper);

    assert.notEqual(counter, generator.inc, 'function should be wrapped');

    assert.doesNotThrow(function () {
      generator.inc();
    });
    assert.equal(2, outsider, 'original function has still been called');

    shimmer.unwrap(generator, 'inc');
    assert.equal(
      counter,
      generator.inc,
      'basic function equality testing should work'
    );
    assert.doesNotThrow(function () {
      generator.inc();
    });
    assert.equal(3, outsider, 'original function has still been called');
  });

  it("shouldn't throw on double unwrapping", function () {
    assert.equal(
      counter,
      generator.inc,
      'basic function equality testing should work'
    );

    const mock = sinon.expectation
      .create('logger')
      .withArgs(
        'no original to unwrap to -- ' + 'has inc already been unwrapped?'
      )
      .once();
    shimmer({ logger: mock });

    function wrapper(original) {
      return function () {
        return original.apply(this, arguments);
      };
    }
    shimmer.wrap(generator, 'inc', wrapper);

    assert.notEqual(counter, generator.inc, 'function should be wrapped');

    shimmer.unwrap(generator, 'inc');
    assert.equal(
      counter,
      generator.inc,
      'basic function equality testing should work'
    );

    assert.doesNotThrow(function () {
      shimmer.unwrap(generator, 'inc');
    }, 'should double unwrap without issue');
    assert.equal(
      counter,
      generator.inc,
      'function is unchanged after unwrapping'
    );

    mock.verify();
  });

  it('unwrap called with no arguments', function () {
    const mock = sinon.expectation.create('logger').twice();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.unwrap();
    }, 'should log instead of throwing');

    mock.verify();
  });

  it('unwrap called with module but no name', function () {
    const mock = sinon.expectation.create('logger').twice();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.unwrap({});
    }, 'should log instead of throwing');

    mock.verify();
  });
});
