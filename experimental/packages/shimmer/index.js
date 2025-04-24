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

/* Modified by OpenTelemetry Authors
 *  - aligned with style-guide
 */

'use strict';

function isFunction(funktion) {
  return typeof funktion === 'function';
}

// Default to complaining loudly when things don't go according to plan.
// eslint-disable-next-line no-console
var logger = console.error.bind(console);

// Sets a property on an object, preserving its enumerability.
// This function assumes that the property is already writable.
function defineProperty(obj, name, value) {
  // eslint-disable-next-line no-prototype-builtins
  var enumerable = !!obj[name] && obj.propertyIsEnumerable(name);
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: enumerable,
    writable: true,
    value: value,
  });
}

// Keep initialization idempotent.
function shimmer(options) {
  if (options && options.logger) {
    if (!isFunction(options.logger))
      logger("new logger isn't a function, not replacing");
    else logger = options.logger;
  }
}

function wrap(nodule, name, wrapper) {
  if (!nodule || !nodule[name]) {
    logger('no original function ' + name + ' to wrap');
    return;
  }

  if (!wrapper) {
    logger('no wrapper function');
    logger(new Error().stack);
    return;
  }

  if (!isFunction(nodule[name]) || !isFunction(wrapper)) {
    logger('original object and wrapper must be functions');
    return;
  }

  var original = nodule[name];
  var wrapped = wrapper(original, name);

  defineProperty(wrapped, '__original', original);
  defineProperty(wrapped, '__unwrap', function () {
    if (nodule[name] === wrapped) defineProperty(nodule, name, original);
  });
  defineProperty(wrapped, '__wrapped', true);

  defineProperty(nodule, name, wrapped);
  return wrapped;
}

function massWrap(nodules, names, wrapper) {
  if (!nodules) {
    logger('must provide one or more modules to patch');
    logger(new Error().stack);
    return;
  } else if (!Array.isArray(nodules)) {
    nodules = [nodules];
  }

  if (!(names && Array.isArray(names))) {
    logger('must provide one or more functions to wrap on modules');
    return;
  }

  nodules.forEach(function (nodule) {
    names.forEach(function (name) {
      wrap(nodule, name, wrapper);
    });
  });
}

function unwrap(nodule, name) {
  if (!nodule || !nodule[name]) {
    logger('no function to unwrap.');
    logger(new Error().stack);
    return;
  }

  if (!nodule[name].__unwrap) {
    logger(
      'no original to unwrap to -- has ' + name + ' already been unwrapped?'
    );
  } else {
    return nodule[name].__unwrap();
  }
}

function massUnwrap(nodules, names) {
  if (!nodules) {
    logger('must provide one or more modules to patch');
    logger(new Error().stack);
    return;
  } else if (!Array.isArray(nodules)) {
    nodules = [nodules];
  }

  if (!(names && Array.isArray(names))) {
    logger('must provide one or more functions to unwrap on modules');
    return;
  }

  nodules.forEach(function (nodule) {
    names.forEach(function (name) {
      unwrap(nodule, name);
    });
  });
}

shimmer.wrap = wrap;
shimmer.massWrap = massWrap;
shimmer.unwrap = unwrap;
shimmer.massUnwrap = massUnwrap;

module.exports = shimmer;
