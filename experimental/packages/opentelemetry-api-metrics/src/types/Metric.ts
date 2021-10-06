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

import {
  BoundBaseObservable,
  BoundCounter,
  BoundHistogram,
} from './BoundInstrument';

/**
 * Options needed for metric creation
 */
export interface MetricOptions {
  /** The name of the component that reports the Metric. */
  component?: string;

  /**
   * The description of the Metric.
   * @default ''
   */
  description?: string;

  /**
   * The unit of the Metric values.
   * @default '1'
   */
  unit?: string;

  /** The map of constant attributes for the Metric. */
  constantAttributes?: Attributes;

  /**
   * Indicates the metric is a verbose metric that is disabled by default
   * @default false
   */
  disabled?: boolean;

  /**
   * Indicates the type of the recorded value.
   * @default {@link ValueType.DOUBLE}
   */
  valueType?: ValueType;

  /**
   * Boundaries optional for histogram
   */
  boundaries?: number[];

  /**
   * Aggregation Temporality of metric
   */
  aggregationTemporality?: AggregationTemporality;
}

export interface BatchObserverOptions {
  /**
   * Indicates how long the batch metric should wait to update before cancel
   */
  maxTimeoutUpdateMS?: number;
}

/** The Type of value. It describes how the data is reported. */
export enum ValueType {
  INT,
  DOUBLE,
}

/** The kind of aggregator. */
export enum AggregationTemporality {
  AGGREGATION_TEMPORALITY_UNSPECIFIED,
  AGGREGATION_TEMPORALITY_DELTA,
  AGGREGATION_TEMPORALITY_CUMULATIVE,
}

/**
 * Metric represents a base class for different types of metric
 * pre aggregations.
 */
export interface Metric {
  /**
   * Clears all bound instruments from the Metric.
   */
  clear(): void;
}

/**
 * UnboundMetric represents a base class for different types of metric
 * pre aggregations without attribute values bound yet.
 */
export interface UnboundMetric<T> extends Metric {
  /**
   * Returns a Instrument associated with specified attributes.
   * It is recommended to keep a reference to the Instrument instead of always
   * calling this method for every operations.
   * @param attributes key-values pairs that are associated with a specific metric
   *     that you want to record.
   */
  bind(attributes: Attributes): T;

  /**
   * Removes the Instrument from the metric, if it is present.
   * @param attributes key-values pairs that are associated with a specific metric.
   */
  unbind(attributes: Attributes): void;
}

/**
 * Counter is the most common synchronous instrument. This instrument supports
 * an `Add(increment)` function for reporting a sum, and is restricted to
 * non-negative increments. The default aggregation is Sum, as for any additive
 * instrument.
 *
 * Example uses for Counter:
 * <ol>
 *   <li> count the number of bytes received. </li>
 *   <li> count the number of requests completed. </li>
 *   <li> count the number of accounts created. </li>
 *   <li> count the number of checkpoints run. </li>
 *   <li> count the number of 5xx errors. </li>
 * <ol>
 */
export interface Counter extends UnboundMetric<BoundCounter> {
  /**
   * Adds the given value to the current value. Values cannot be negative.
   */
  add(value: number, attributes?: Attributes): void;
}

export interface UpDownCounter extends UnboundMetric<BoundCounter> {
  /**
   * Adds the given value to the current value. Values can be negative.
   */
  add(value: number, attributes?: Attributes): void;
}

export interface Histogram extends UnboundMetric<BoundHistogram> {
  /**
   * Records the given value to this histogram.
   */
  record(value: number, attributes?: Attributes): void;
}

/** Base interface for the Observer metrics. */
export interface BaseObservable extends UnboundMetric<BoundBaseObservable> {
  observation: (
    value: number
  ) => {
    value: number;
    observer: BaseObservable;
  };
}

/** Base interface for the ObservableGauge metrics. */
export type ObservableGauge = BaseObservable;

/** Base interface for the ObservableUpDownCounter metrics. */
export type ObservableUpDownCounter = BaseObservable;

/** Base interface for the ObservableCounter metrics. */
export type ObservableCounter = BaseObservable;

/**
 * key-value pairs passed by the user.
 */
export type AttributeValue = string | number | string[] | number[] | boolean | boolean[];
export type Attributes = { [key: string]: AttributeValue };
