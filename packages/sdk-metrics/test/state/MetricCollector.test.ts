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
import * as sinon from 'sinon';
import { MeterProvider } from '../../src';
import { TimeoutError } from '../../src/utils';
import { DataPointType } from '../../src/export/MetricData';
import { MeterProviderSharedState } from '../../src/state/MeterProviderSharedState';
import { MetricCollector } from '../../src/state/MetricCollector';
import {
  defaultInstrumentationScope,
  testResource,
  assertMetricData,
  assertDataPoint,
  ObservableCallbackDelegate,
  BatchObservableCallbackDelegate,
} from '../util';
import {
  TestDeltaMetricReader,
  TestMetricReader,
} from '../export/TestMetricReader';

describe('MetricCollector', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should construct MetricCollector without exceptions', () => {
      const meterProviderSharedState = new MeterProviderSharedState(
        testResource
      );
      const readers = [new TestMetricReader(), new TestDeltaMetricReader()];
      for (const reader of readers) {
        assert.doesNotThrow(
          () => new MetricCollector(meterProviderSharedState, reader)
        );
      }
    });
  });

  describe('collect', () => {
    function setupInstruments() {
      const reader = new TestMetricReader();
      const meterProvider = new MeterProvider({
        resource: testResource,
        readers: [reader],
      });

      const metricCollector = reader.getMetricCollector();

      const meter = meterProvider.getMeter(
        defaultInstrumentationScope.name,
        defaultInstrumentationScope.version,
        {
          schemaUrl: defaultInstrumentationScope.schemaUrl,
        }
      );

      return { metricCollector, meter };
    }

    it('should collect sync metrics', async () => {
      /** preparing test instrumentations */
      const { metricCollector, meter } = setupInstruments();

      /** creating metric events */
      const counter = meter.createCounter('counter1');
      counter.add(1, {});
      counter.add(2, { foo: 'bar' });

      const counter2 = meter.createCounter('counter2');
      counter2.add(3);

      /** collect metrics */
      const { resourceMetrics, errors } = await metricCollector.collect();
      assert.strictEqual(errors.length, 0);
      const { scopeMetrics } = resourceMetrics;
      const { metrics } = scopeMetrics[0];
      assert.strictEqual(metrics.length, 2);

      /** checking batch[0] */
      const metricData1 = metrics[0];
      assertMetricData(metricData1, DataPointType.SUM, {
        name: 'counter1',
      });
      assert.strictEqual(metricData1.dataPoints.length, 2);
      assertDataPoint(metricData1.dataPoints[0], {}, 1);
      assertDataPoint(metricData1.dataPoints[1], { foo: 'bar' }, 2);

      /** checking batch[1] */
      const metricData2 = metrics[1];
      assertMetricData(metricData2, DataPointType.SUM, {
        name: 'counter2',
      });
      assert.strictEqual(metricData2.dataPoints.length, 1);
      assertDataPoint(metricData2.dataPoints[0], {}, 3);
    });

    it('should collect async metrics', async () => {
      /** preparing test instrumentations */
      const { metricCollector, meter } = setupInstruments();

      /** creating metric events */
      /** observable */
      const delegate1 = new ObservableCallbackDelegate();
      const observableCounter1 = meter.createObservableCounter('observable1');
      observableCounter1.addCallback(delegate1.getCallback());
      delegate1.setDelegate(observableResult => {
        observableResult.observe(1, {});
        observableResult.observe(2, { foo: 'bar' });
      });

      /** batch observable */
      const delegate2 = new BatchObservableCallbackDelegate();
      const observableCounter2 = meter.createObservableCounter('observable2');
      const observableCounter3 = meter.createObservableCounter('observable3');
      meter.addBatchObservableCallback(delegate2.getCallback(), [
        observableCounter2,
        observableCounter3,
      ]);
      delegate2.setDelegate(observableResult => {
        observableResult.observe(observableCounter2, 3, {});
        observableResult.observe(observableCounter2, 4, { foo: 'bar' });
      });

      /** collect metrics */
      const { resourceMetrics, errors } = await metricCollector.collect();
      assert.strictEqual(errors.length, 0);
      const { scopeMetrics } = resourceMetrics;
      const { metrics } = scopeMetrics[0];
      // Should not export observableCounter3, as it was never observed
      assert.strictEqual(metrics.length, 2);

      /** checking batch[0] */
      const metricData1 = metrics[0];
      assertMetricData(metricData1, DataPointType.SUM, {
        name: 'observable1',
      });
      assert.strictEqual(metricData1.dataPoints.length, 2);
      assertDataPoint(metricData1.dataPoints[0], {}, 1);
      assertDataPoint(metricData1.dataPoints[1], { foo: 'bar' }, 2);

      /** checking batch[1] */
      const metricData2 = metrics[1];
      assertMetricData(metricData2, DataPointType.SUM, {
        name: 'observable2',
      });
      assert.strictEqual(metricData2.dataPoints.length, 2);
      assertDataPoint(metricData2.dataPoints[0], {}, 3);
      assertDataPoint(metricData2.dataPoints[1], { foo: 'bar' }, 4);
    });

    it('should collect observer metrics with timeout', async () => {
      const timer = sinon.useFakeTimers();
      /** preparing test instrumentations */
      const { metricCollector, meter } = setupInstruments();

      /** creating metric events */

      /** observer1 is an abnormal observer */
      const delegate1 = new ObservableCallbackDelegate();
      const observableCounter1 = meter.createObservableCounter('observer1');
      observableCounter1.addCallback(delegate1.getCallback());
      delegate1.setDelegate(_observableResult => {
        return new Promise(() => {
          /** promise never settles */
        });
      });

      /** observer2 is a normal observer */
      const delegate2 = new ObservableCallbackDelegate();
      const observableCounter2 = meter.createObservableCounter('observer2');
      observableCounter2.addCallback(delegate2.getCallback());
      delegate2.setDelegate(observableResult => {
        observableResult.observe(1, {});
      });

      /** collect metrics */
      {
        const future = metricCollector.collect({
          timeoutMillis: 100,
        });
        timer.tick(200);
        const { resourceMetrics, errors } = await future;
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0] instanceof TimeoutError);
        const { scopeMetrics } = resourceMetrics;
        const { metrics } = scopeMetrics[0];

        // Only observer2 is exported, observer1 never reported a measurement
        assert.strictEqual(metrics.length, 1);

        /** observer2 */
        assertMetricData(metrics[0], DataPointType.SUM, {
          name: 'observer2',
        });
        assert.strictEqual(metrics[0].dataPoints.length, 1);
      }

      /** now the observer1 is back to normal */
      delegate1.setDelegate(async observableResult => {
        observableResult.observe(100, {});
      });

      /** collect metrics */
      {
        const future = metricCollector.collect({
          timeoutMillis: 100,
        });
        timer.tick(100);
        const { resourceMetrics, errors } = await future;
        assert.strictEqual(errors.length, 0);
        const { scopeMetrics } = resourceMetrics;
        const { metrics } = scopeMetrics[0];
        assert.strictEqual(metrics.length, 2);

        /** observer1 */
        assertMetricData(metrics[0], DataPointType.SUM, {
          name: 'observer1',
        });
        assert.strictEqual(metrics[0].dataPoints.length, 1);
        assertDataPoint(metrics[0].dataPoints[0], {}, 100);

        /** observer2 */
        assertMetricData(metrics[1], DataPointType.SUM, {
          name: 'observer2',
        });
        assert.strictEqual(metrics[1].dataPoints.length, 1);
      }
    });

    it('should collect with throwing observable callbacks', async () => {
      /** preparing test instrumentations */
      const { metricCollector, meter } = setupInstruments();

      /** creating metric events */
      const counter = meter.createCounter('counter1');
      counter.add(1);

      /** observer1 is an abnormal observer */
      const observableCounter1 = meter.createObservableCounter('observer1');
      observableCounter1.addCallback(_observableResult => {
        throw new Error('foobar');
      });

      /** collect metrics */
      const { resourceMetrics, errors } = await metricCollector.collect();
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(`${errors[0]}`, 'Error: foobar');
      const { scopeMetrics } = resourceMetrics;
      const { metrics } = scopeMetrics[0];

      /** only counter1 data points are collected */
      assert.strictEqual(metrics.length, 1);
      assertMetricData(metrics[0], DataPointType.SUM, {
        name: 'counter1',
      });
      assert.strictEqual(metrics[0].dataPoints.length, 1);
    });

    it('should collect batch observer metrics with timeout', async () => {
      const timer = sinon.useFakeTimers();
      /** preparing test instrumentations */
      const { metricCollector, meter } = setupInstruments();

      /** creating metric events */

      /** observer1 is an abnormal observer */
      const observableCounter1 = meter.createObservableCounter('observer1');
      const delegate1 = new BatchObservableCallbackDelegate();
      meter.addBatchObservableCallback(delegate1.getCallback(), [
        observableCounter1,
      ]);
      delegate1.setDelegate(_observableResult => {
        return new Promise(() => {
          /** promise never settles */
        });
      });

      /** observer2 is a normal observer */
      const observableCounter2 = meter.createObservableCounter('observer2');
      const delegate2 = new BatchObservableCallbackDelegate();
      meter.addBatchObservableCallback(delegate2.getCallback(), [
        observableCounter2,
      ]);
      delegate2.setDelegate(observableResult => {
        observableResult.observe(observableCounter2, 1, {});
      });

      /** collect metrics */
      {
        const future = metricCollector.collect({
          timeoutMillis: 100,
        });
        timer.tick(200);
        const { resourceMetrics, errors } = await future;
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0] instanceof TimeoutError);
        const { scopeMetrics } = resourceMetrics;
        const { metrics } = scopeMetrics[0];

        /** only observer2 is present; observer1's promise never settled*/
        assert.strictEqual(metrics.length, 1);
        assertMetricData(metrics[0], DataPointType.SUM, {
          name: 'observer2',
        });
        assert.strictEqual(metrics[0].dataPoints.length, 1);
      }

      /** now the observer1 is back to normal */
      delegate1.setDelegate(async observableResult => {
        observableResult.observe(observableCounter1, 100, {});
      });

      /** collect metrics */
      {
        const future = metricCollector.collect({
          timeoutMillis: 100,
        });
        timer.tick(100);
        const { resourceMetrics, errors } = await future;
        assert.strictEqual(errors.length, 0);
        const { scopeMetrics } = resourceMetrics;
        const { metrics } = scopeMetrics[0];
        assert.strictEqual(metrics.length, 2);

        /** observer1 */
        assertMetricData(metrics[0], DataPointType.SUM, {
          name: 'observer1',
        });
        assert.strictEqual(metrics[0].dataPoints.length, 1);
        assertDataPoint(metrics[0].dataPoints[0], {}, 100);

        /** observer2 */
        assertMetricData(metrics[1], DataPointType.SUM, {
          name: 'observer2',
        });
        assert.strictEqual(metrics[1].dataPoints.length, 1);
      }
    });

    it('should collect with throwing batch observable callbacks', async () => {
      /** preparing test instrumentations */
      const { metricCollector, meter } = setupInstruments();

      /** creating metric events */
      const counter = meter.createCounter('counter1');
      counter.add(1);

      /** observer1 is an abnormal observer */
      const observableCounter1 = meter.createObservableCounter('observer1');
      const delegate1 = new BatchObservableCallbackDelegate();
      meter.addBatchObservableCallback(delegate1.getCallback(), [
        observableCounter1,
      ]);
      delegate1.setDelegate(_observableResult => {
        throw new Error('foobar');
      });

      /** collect metrics */
      const { resourceMetrics, errors } = await metricCollector.collect();
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(`${errors[0]}`, 'Error: foobar');
      const { scopeMetrics } = resourceMetrics;
      const { metrics } = scopeMetrics[0];

      /** counter1 data points are collected; observer1's callback did throw, so data points are not collected */
      assert.strictEqual(metrics.length, 1);
      assertMetricData(metrics[0], DataPointType.SUM, {
        name: 'counter1',
      });
      assert.strictEqual(metrics[0].dataPoints.length, 1);
    });

    /**
     * Spec: https://opentelemetry.io/docs/specs/otel/metrics/sdk/#metricreader
     *
     * "For synchronous instruments with Cumulative aggregation temporality,
     *  MetricReader.Collect MUST receive data points exposed in previous
     *  collections regardless of whether new measurements have been recorded."
     *
     * "For instruments with Cumulative aggregation temporality, successive data
     *  points received by successive calls to MetricReader.Collect MUST repeat
     *  the same starting timestamps (e.g. (T0, T1], (T0, T2], (T0, T3])."
     */
    it('sync + cumulative: should persist data points across empty cycles with repeating start timestamps', async () => {
      const clock = sinon.useFakeTimers(0);
      const reader = new TestMetricReader();
      const meterProvider = new MeterProvider({
        resource: testResource,
        readers: [reader],
      });
      const meter = meterProvider.getMeter(
        defaultInstrumentationScope.name,
        defaultInstrumentationScope.version,
        { schemaUrl: defaultInstrumentationScope.schemaUrl }
      );
      const collector = reader.getMetricCollector();

      const counter = meter.createCounter('counter');

      clock.tick(10); // T0 — record time
      counter.add(5, { key: 'A' });

      clock.tick(10); // T1 — first collection
      const result1 = await collector.collect();
      assert.strictEqual(result1.errors.length, 0);
      const dp1 =
        result1.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
      assertDataPoint(dp1, { key: 'A' }, 5);
      const startTime1 = dp1.startTime;

      // No new measurements recorded
      clock.tick(10); // T2
      const result2 = await collector.collect();
      // MUST persist regardless of no new measurements
      assert.strictEqual(result2.resourceMetrics.scopeMetrics.length, 1);
      const dp2 =
        result2.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
      assertDataPoint(dp2, { key: 'A' }, 5);
      // MUST repeat the same start timestamp
      assert.deepStrictEqual(
        dp2.startTime,
        startTime1,
        'startTime must repeat for cumulative across empty cycles'
      );

      // New measurement — cumulative value should grow, start time still repeats.
      // Also add a new attribute set {key:'B'} that was never previously recorded.
      counter.add(3, { key: 'A' });
      counter.add(7, { key: 'B' }); // B appears for the first time
      clock.tick(10); // T3
      const result3 = await collector.collect();
      assert.strictEqual(result3.resourceMetrics.scopeMetrics.length, 1);
      const dps3 =
        result3.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints;
      assert.strictEqual(dps3.length, 2);
      assertDataPoint(dps3[0], { key: 'A' }, 8); // cumulative: 5+3
      assertDataPoint(dps3[1], { key: 'B' }, 7); // first appearance
      assert.deepStrictEqual(
        dps3[0].startTime,
        startTime1,
        'A startTime must still repeat after additional recording'
      );

      // T4: no new recordings — both A and B must persist with unchanged values
      clock.tick(10);
      const result4 = await collector.collect();
      assert.strictEqual(result4.resourceMetrics.scopeMetrics.length, 1);
      const dps4 =
        result4.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints;
      assert.strictEqual(
        dps4.length,
        2,
        'both A and B must persist in cumulative even with no new recordings'
      );
      assertDataPoint(dps4[0], { key: 'A' }, 8);
      assertDataPoint(dps4[1], { key: 'B' }, 7);
      assert.deepStrictEqual(
        dps4[0].startTime,
        startTime1,
        'A startTime must repeat'
      );
      assert.deepStrictEqual(
        dps4[1].startTime,
        dps3[1].startTime,
        'B startTime must repeat after its first appearance'
      );
    });

    /**
     * Spec: https://opentelemetry.io/docs/specs/otel/metrics/sdk/#metricreader
     *
     * "For synchronous instruments with Delta aggregation temporality,
     *  MetricReader.Collect MUST only receive data points with measurements
     *  recorded since the previous collection."
     *
     * "For instruments with Delta aggregation temporality, successive data
     *  points received by successive calls to MetricReader.Collect MUST
     *  advance the starting timestamp (e.g. (T0, T1], (T1, T2], (T2, T3])."
     */
    it('sync + delta: should only report when measurements recorded, with advancing start timestamps', async () => {
      const clock = sinon.useFakeTimers(0);
      const reader = new TestDeltaMetricReader();
      const meterProvider = new MeterProvider({
        resource: testResource,
        readers: [reader],
      });
      const meter = meterProvider.getMeter(
        defaultInstrumentationScope.name,
        defaultInstrumentationScope.version,
        { schemaUrl: defaultInstrumentationScope.schemaUrl }
      );
      const collector = reader.getMetricCollector();

      const counter = meter.createCounter('counter');

      clock.tick(10);
      counter.add(5, { key: 'A' });
      counter.add(10, { key: 'B' }); // B recorded alongside A

      clock.tick(10); // T1
      const result1 = await collector.collect();
      assert.strictEqual(result1.errors.length, 0);
      assert.strictEqual(result1.resourceMetrics.scopeMetrics.length, 1);
      const dps1Delta =
        result1.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints;
      assert.strictEqual(dps1Delta.length, 2); // both A and B
      assertDataPoint(dps1Delta[0], { key: 'A' }, 5);
      assertDataPoint(dps1Delta[1], { key: 'B' }, 10);
      const endTime1 = dps1Delta[0].endTime;

      // No new measurements recorded
      clock.tick(10); // T2
      const result2 = await collector.collect();
      // MUST NOT appear — no measurements since previous collection
      assert.strictEqual(
        result2.resourceMetrics.scopeMetrics.length,
        0,
        'delta instruments with no new measurements MUST NOT appear'
      );

      // Both A and B re-appear after the absent cycle — only new deltas emitted
      clock.tick(10);
      counter.add(3, { key: 'A' });
      counter.add(4, { key: 'B' }); // B re-appears
      clock.tick(10); // T3
      const result3 = await collector.collect();
      assert.strictEqual(result3.resourceMetrics.scopeMetrics.length, 1);
      const dps3Delta =
        result3.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints;
      assert.strictEqual(
        dps3Delta.length,
        2,
        'both A and B must re-appear after recording'
      );
      assertDataPoint(dps3Delta[0], { key: 'A' }, 3); // only this cycle's delta
      assertDataPoint(dps3Delta[1], { key: 'B' }, 4); // only this cycle's delta
      // MUST advance: startTime must be >= endTime of the last non-empty collection
      assert.ok(
        dps3Delta[0].startTime[0] > endTime1[0] ||
          (dps3Delta[0].startTime[0] === endTime1[0] &&
            dps3Delta[0].startTime[1] >= endTime1[1]),
        'startTime must advance for delta instruments'
      );
    });

    /**
     * Spec: https://opentelemetry.io/docs/specs/otel/metrics/sdk/#metricreader
     *
     * "For asynchronous instruments with Delta or Cumulative aggregation
     *  temporality, MetricReader.Collect MUST only receive data points with
     *  measurements recorded since the previous collection."
     *
     * "For instruments with Cumulative aggregation temporality, successive data
     *  points received by successive calls to MetricReader.Collect MUST repeat
     *  the same starting timestamps."
     */
    it('async + cumulative: should only report observed attribute sets, with repeating start timestamps', async () => {
      const clock = sinon.useFakeTimers(0);
      const reader = new TestMetricReader();
      const meterProvider = new MeterProvider({
        resource: testResource,
        readers: [reader],
      });
      const meter = meterProvider.getMeter(
        defaultInstrumentationScope.name,
        defaultInstrumentationScope.version,
        { schemaUrl: defaultInstrumentationScope.schemaUrl }
      );
      const collector = reader.getMetricCollector();

      const delegate = new ObservableCallbackDelegate();
      const observableCounter = meter.createObservableCounter('counter');
      observableCounter.addCallback(delegate.getCallback());

      // T1: observe both A and B
      delegate.setDelegate(obs => {
        obs.observe(10, { key: 'A' });
        obs.observe(20, { key: 'B' });
      });
      clock.tick(10);
      const result1 = await collector.collect();
      assert.strictEqual(result1.errors.length, 0);
      const metrics1 = result1.resourceMetrics.scopeMetrics[0].metrics[0];
      assert.strictEqual(metrics1.dataPoints.length, 2);
      const dpA1 = (
        metrics1.dataPoints as Array<{
          attributes: Record<string, unknown>;
          startTime: [number, number];
        }>
      ).find(dp => dp.attributes['key'] === 'A')!;
      const startTimeA = dpA1.startTime;

      // T2: observe only A — B not reported
      delegate.setDelegate(obs => {
        obs.observe(15, { key: 'A' });
      });
      clock.tick(10);
      const result2 = await collector.collect();
      const metrics2 = result2.resourceMetrics.scopeMetrics[0].metrics[0];
      // B MUST NOT appear — not observed in this callback
      assert.strictEqual(
        metrics2.dataPoints.length,
        1,
        'attribute sets not observed in callback MUST NOT appear'
      );
      assert.deepStrictEqual(metrics2.dataPoints[0].attributes, { key: 'A' });
      assertDataPoint(metrics2.dataPoints[0], { key: 'A' }, 15); // cumulative value
      // MUST repeat start timestamp
      assert.deepStrictEqual(
        metrics2.dataPoints[0].startTime,
        startTimeA,
        'startTime must repeat for async cumulative'
      );

      // T3: B re-appears alongside A. Cumulative history for B must be preserved
      // through the absent cycle so the output value is correct.
      delegate.setDelegate(obs => {
        obs.observe(20, { key: 'A' }); // cumulative total: 20
        obs.observe(25, { key: 'B' }); // B re-appears; cumulative total: 25
      });
      clock.tick(10);
      const result3 = await collector.collect();
      assert.strictEqual(result3.resourceMetrics.scopeMetrics.length, 1);
      const metrics3 = result3.resourceMetrics.scopeMetrics[0].metrics[0];
      assert.strictEqual(
        metrics3.dataPoints.length,
        2,
        'both A and B must re-appear when observed again'
      );
      assertDataPoint(metrics3.dataPoints[0], { key: 'A' }, 20); // cumulative
      assertDataPoint(metrics3.dataPoints[1], { key: 'B' }, 25); // cumulative (history preserved through gap)
      // Start timestamps must still repeat from the original observation
      assert.deepStrictEqual(
        metrics3.dataPoints[0].startTime,
        startTimeA,
        'A startTime must keep repeating after B re-appearance'
      );
      const dpB1 = (
        metrics1.dataPoints as Array<{
          attributes: Record<string, unknown>;
          startTime: [number, number];
        }>
      ).find(dp => dp.attributes['key'] === 'B')!;
      assert.deepStrictEqual(
        metrics3.dataPoints[1].startTime,
        dpB1.startTime,
        'B startTime must repeat from original first observation, not the re-appearance cycle'
      );

      // T4: callback observes nothing — no output at all
      delegate.setDelegate(_obs => {});
      clock.tick(10);
      const result4 = await collector.collect();
      assert.strictEqual(
        result4.resourceMetrics.scopeMetrics.length,
        0,
        'nothing must be emitted when callback observes no measurements'
      );
    });

    /**
     * Spec: https://opentelemetry.io/docs/specs/otel/metrics/sdk/#metricreader
     *
     * "For asynchronous instruments with Delta or Cumulative aggregation
     *  temporality, MetricReader.Collect MUST only receive data points with
     *  measurements recorded since the previous collection."
     *
     * "For instruments with Delta aggregation temporality, successive data
     *  points received by successive calls to MetricReader.Collect MUST
     *  advance the starting timestamp."
     */
    it('async + delta: should only report observed attribute sets, with advancing start timestamps', async () => {
      const clock = sinon.useFakeTimers(0);
      const reader = new TestDeltaMetricReader();
      const meterProvider = new MeterProvider({
        resource: testResource,
        readers: [reader],
      });
      const meter = meterProvider.getMeter(
        defaultInstrumentationScope.name,
        defaultInstrumentationScope.version,
        { schemaUrl: defaultInstrumentationScope.schemaUrl }
      );
      const collector = reader.getMetricCollector();

      const delegate = new ObservableCallbackDelegate();
      const observableCounter = meter.createObservableCounter('counter');
      observableCounter.addCallback(delegate.getCallback());

      // T1: observe both A and B
      delegate.setDelegate(obs => {
        obs.observe(10, { key: 'A' });
        obs.observe(20, { key: 'B' });
      });
      clock.tick(10);
      const result1 = await collector.collect();
      assert.strictEqual(result1.errors.length, 0);
      const metrics1 = result1.resourceMetrics.scopeMetrics[0].metrics[0];
      assert.strictEqual(metrics1.dataPoints.length, 2);
      const endTime1 = metrics1.dataPoints[0].endTime;

      // T2: observe only A with higher value — B not reported
      delegate.setDelegate(obs => {
        obs.observe(15, { key: 'A' }); // delta: 15-10 = 5
      });
      clock.tick(10);
      const result2 = await collector.collect();
      const metrics2 = result2.resourceMetrics.scopeMetrics[0].metrics[0];
      // B MUST NOT appear — not observed in this callback
      assert.strictEqual(
        metrics2.dataPoints.length,
        1,
        'attribute sets not observed in callback MUST NOT appear'
      );
      assert.deepStrictEqual(metrics2.dataPoints[0].attributes, { key: 'A' });
      assertDataPoint(metrics2.dataPoints[0], { key: 'A' }, 5); // delta: 15-10
      // MUST advance start timestamp
      const dp2 = metrics2.dataPoints[0];
      assert.deepStrictEqual(
        dp2.startTime,
        endTime1,
        'startTime must equal endTime of previous collection for async delta'
      );

      // T3: B re-appears alongside A. Only the delta since the last observation is emitted.
      delegate.setDelegate(obs => {
        obs.observe(20, { key: 'A' }); // delta: 20-15 = 5
        obs.observe(25, { key: 'B' }); // B re-appears; delta: 25-20 = 5
      });
      clock.tick(10);
      const result3 = await collector.collect();
      assert.strictEqual(result3.resourceMetrics.scopeMetrics.length, 1);
      const metrics3 = result3.resourceMetrics.scopeMetrics[0].metrics[0];
      assert.strictEqual(
        metrics3.dataPoints.length,
        2,
        'both A and B must re-appear when observed again'
      );
      assertDataPoint(metrics3.dataPoints[0], { key: 'A' }, 5); // delta: 20-15
      assertDataPoint(metrics3.dataPoints[1], { key: 'B' }, 5); // delta: 25-20

      // T4: callback observes nothing — no output at all
      delegate.setDelegate(_obs => {});
      clock.tick(10);
      const result4 = await collector.collect();
      assert.strictEqual(
        result4.resourceMetrics.scopeMetrics.length,
        0,
        'nothing must be emitted when callback observes no measurements'
      );
    });

    it('should not report delta sync instruments with no measurements in the current collection cycle', async () => {
      const reader = new TestDeltaMetricReader();
      const meterProvider = new MeterProvider({
        resource: testResource,
        readers: [reader],
      });
      const metricCollector = reader.getMetricCollector();
      const meter = meterProvider.getMeter(
        defaultInstrumentationScope.name,
        defaultInstrumentationScope.version,
        { schemaUrl: defaultInstrumentationScope.schemaUrl }
      );

      const counter = meter.createCounter('counter1');
      counter.add(1, {});

      /** first collection: measurement is present */
      {
        const { resourceMetrics, errors } = await metricCollector.collect();
        assert.strictEqual(errors.length, 0);
        assert.strictEqual(resourceMetrics.scopeMetrics.length, 1);
        assert.strictEqual(
          resourceMetrics.scopeMetrics[0].metrics.length,
          1,
          'counter1 should be present in first collection'
        );
        assertMetricData(
          resourceMetrics.scopeMetrics[0].metrics[0],
          DataPointType.SUM,
          {
            name: 'counter1',
          }
        );
      }

      /** second collection: no new measurements recorded — instrument must not appear */
      {
        const { resourceMetrics, errors } = await metricCollector.collect();
        assert.strictEqual(errors.length, 0);
        assert.strictEqual(
          resourceMetrics.scopeMetrics.length,
          0,
          'no scope metrics should be reported when no measurements were recorded'
        );
      }
    });
  });
});
