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
  dec: anticounter,
};

const arrow = {
  in: counter,
  out: anticounter,
};

const nester = {
  in: counter,
  out: anticounter,
};

describe('massWrap', function () {
  it('should wrap multiple functions safely', function () {
    assert.equal(
      counter,
      generator.inc,
      'basic function equality testing should work'
    );
    assert.equal(
      anticounter,
      generator.dec,
      'basic function equality testing should work'
    );
    assert.doesNotThrow(function () {
      generator.inc();
    });
    assert.doesNotThrow(function () {
      generator.dec();
    });
    assert.equal(0, outsider, 'calls have side effects');

    let count = 0;
    function wrapper(original) {
      return function () {
        count++;
        const returned = original.apply(this, arguments);
        count++;
        return returned;
      };
    }
    shimmer.massWrap(generator, ['inc', 'dec'], wrapper);

    assert.doesNotThrow(function () {
      generator.inc();
    });
    assert.doesNotThrow(function () {
      generator.dec();
    });
    assert.equal(4, count, 'both pre and post increments should have happened');
    assert.equal(0, outsider, 'original function has still been called');
  });

  it('should wrap multiple functions on multiple modules safely', function () {
    assert.equal(
      counter,
      arrow.in,
      'basic function equality testing should work'
    );
    assert.equal(
      counter,
      nester.in,
      'basic function equality testing should work'
    );
    assert.equal(
      anticounter,
      arrow.out,
      'basic function equality testing should work'
    );
    assert.equal(
      anticounter,
      nester.out,
      'basic function equality testing should work'
    );

    assert.doesNotThrow(function () {
      arrow.in();
    });
    assert.doesNotThrow(function () {
      nester.in();
    });
    assert.doesNotThrow(function () {
      arrow.out();
    });
    assert.doesNotThrow(function () {
      nester.out();
    });

    assert.equal(0, outsider, 'calls have side effects');

    let count = 0;

    function wrapper(original) {
      return function () {
        count++;
        var returned = original.apply(this, arguments);
        count++;
        return returned;
      };
    }
    shimmer.massWrap([arrow, nester], ['in', 'out'], wrapper);

    assert.doesNotThrow(function () {
      arrow.in();
    });
    assert.doesNotThrow(function () {
      arrow.out();
    });
    assert.doesNotThrow(function () {
      nester.in();
    });
    assert.doesNotThrow(function () {
      nester.out();
    });

    assert.equal(8, count, 'both pre and post increments should have happened');
    assert.equal(0, outsider, 'original function has still been called');
  });

  it('wrap called with no arguments', function () {
    const mock = sinon.expectation.create('logger').twice();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.massWrap();
    }, "wrapping with no arguments doesn't throw");

    assert.doesNotThrow(function () {
      mock.verify();
    }, 'logger was called with the expected message');
  });

  it('wrap called with module but nothing else', function () {
    const mock = sinon.expectation
      .create('logger')
      .withExactArgs('must provide one or more functions to wrap on modules')
      .once();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.massWrap(generator);
    }, "wrapping with only 1 argument doesn't throw");

    assert.doesNotThrow(function () {
      mock.verify();
    }, 'logger was called with the expected message');
  });

  it('wrap called with original but no wrapper', function () {
    const mock = sinon.expectation.create('logger').twice();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.massWrap(generator, ['inc']);
    }, "wrapping with only original function doesn't throw");

    mock.verify();
  });

  it('wrap called with non-function original', function () {
    const mock = sinon.expectation
      .create('logger')
      .withExactArgs('must provide one or more functions to wrap on modules')
      .once();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.massWrap({ orange: 'slices' }, 'orange', function () {});
    }, "wrapping non-function original doesn't throw");

    mock.verify();
  });

  it('wrap called with non-function wrapper', function () {
    const mock = sinon.expectation
      .create('logger')
      .withArgs('must provide one or more functions to wrap on modules')
      .once();
    shimmer({ logger: mock });

    assert.doesNotThrow(function () {
      shimmer.massWrap({ orange: function () {} }, 'orange', 'hamchunx');
    }, "wrapping with non-function wrapper doesn't throw");

    mock.verify();
  });
});
