/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentType } from './MetricData';

/**
 * Cardinality Limit selector based on metric instrument types.
 */
export type CardinalitySelector = (instrumentType: InstrumentType) => number;

/**
 * Per-instrument-type cardinality limits. Any type without an explicit limit
 * uses `default`, which itself defaults to 2000.
 */
export interface CardinalityLimits {
  counter?: number;
  gauge?: number;
  histogram?: number;
  upDownCounter?: number;
  observableCounter?: number;
  observableGauge?: number;
  observableUpDownCounter?: number;
  default?: number;
}

/**
 * Creates a {@link CardinalitySelector} from {@link CardinalityLimits}.
 * @internal
 */
export function createCardinalitySelector(
  cardinalityLimits?: CardinalityLimits
): CardinalitySelector {
  const limits = {
    default: 2000,
    ...cardinalityLimits,
  };

  return (instrumentType: InstrumentType) => {
    switch (instrumentType) {
      case InstrumentType.COUNTER:
        return limits.counter ?? limits.default;
      case InstrumentType.GAUGE:
        return limits.gauge ?? limits.default;
      case InstrumentType.HISTOGRAM:
        return limits.histogram ?? limits.default;
      case InstrumentType.OBSERVABLE_COUNTER:
        return limits.observableCounter ?? limits.default;
      case InstrumentType.OBSERVABLE_UP_DOWN_COUNTER:
        return limits.observableUpDownCounter ?? limits.default;
      case InstrumentType.OBSERVABLE_GAUGE:
        return limits.observableGauge ?? limits.default;
      case InstrumentType.UP_DOWN_COUNTER:
        return limits.upDownCounter ?? limits.default;
      default:
        return limits.default;
    }
  };
}
