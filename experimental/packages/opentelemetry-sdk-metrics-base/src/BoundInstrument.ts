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

import { diag } from '@opentelemetry/api';
import * as api from '@opentelemetry/api-metrics';
import { Aggregator } from './export/types';

/**
 * This class represent the base to BoundInstrument, which is responsible for generating
 * the TimeSeries.
 */
export class BaseBoundInstrument {
  protected _attributes: api.Attributes;

  constructor(
    attributes: api.Attributes,
    private readonly _disabled: boolean,
    private readonly _valueType: api.ValueType,
    private readonly _aggregator: Aggregator
  ) {
    this._attributes = attributes;
  }

  update(value: number): void {
    if (this._disabled) return;
    if (typeof value !== 'number') {
      diag.error(
        `Metric cannot accept a non-number value for ${Object.values(
          this._attributes
        )}.`
      );
      return;
    }

    if (this._valueType === api.ValueType.INT && !Number.isInteger(value)) {
      diag.warn(
        `INT value type cannot accept a floating-point value for ${Object.values(
          this._attributes
        )}, ignoring the fractional digits.`
      );
      value = Math.trunc(value);
    }

    this._aggregator.update(value);
  }

  getAttributes(): api.Attributes {
    return this._attributes;
  }

  getAggregator(): Aggregator {
    return this._aggregator;
  }
}

/**
 * BoundCounter allows the SDK to observe/record a single metric event. The
 * value of single instrument in the `Counter` associated with specified Attributes.
 */
export class BoundCounter
  extends BaseBoundInstrument
  implements api.BoundCounter {
  constructor(
    attributes: api.Attributes,
    disabled: boolean,
    valueType: api.ValueType,
    aggregator: Aggregator
  ) {
    super(attributes, disabled, valueType, aggregator);
  }

  add(value: number): void {
    if (value < 0) {
      diag.error(`Counter cannot descend for ${Object.values(this._attributes)}`);
      return;
    }

    this.update(value);
  }
}

/**
 * BoundUpDownCounter allows the SDK to observe/record a single metric event.
 * The value of single instrument in the `UpDownCounter` associated with
 * specified Attributes.
 */
export class BoundUpDownCounter
  extends BaseBoundInstrument
  implements api.BoundCounter {
  constructor(
    attributes: api.Attributes,
    disabled: boolean,
    valueType: api.ValueType,
    aggregator: Aggregator
  ) {
    super(attributes, disabled, valueType, aggregator);
  }

  add(value: number): void {
    this.update(value);
  }
}

/**
 * BoundMeasure is an implementation of the {@link BoundMeasure} interface.
 */
export class BoundHistogram
  extends BaseBoundInstrument
  implements api.BoundHistogram {
  constructor(
    attributes: api.Attributes,
    disabled: boolean,
    valueType: api.ValueType,
    aggregator: Aggregator
  ) {
    super(attributes, disabled, valueType, aggregator);
  }

  record(value: number): void {
    this.update(value);
  }
}

/**
 * BoundObservable is an implementation of the {@link BoundObservable} interface.
 */
export class BoundObservable
  extends BaseBoundInstrument
  implements api.BoundBaseObservable {
  constructor(
    attributes: api.Attributes,
    disabled: boolean,
    valueType: api.ValueType,
    aggregator: Aggregator
  ) {
    super(attributes, disabled, valueType, aggregator);
  }
}
