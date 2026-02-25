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

import { SumAggregator } from '../../src/aggregator';
import { AggregationTemporality } from '../../src/export/AggregationTemporality';
import { DataPointType } from '../../src/export/MetricData';
import { MetricCollectorHandle } from '../../src/state/MetricCollector';
import { AsyncMetricStorage } from '../../src/state/AsyncMetricStorage';
import { createNoopAttributesProcessor } from '../../src/view/AttributesProcessor';
import { ObservableRegistry } from '../../src/state/ObservableRegistry';
import {
  assertMetricData,
  assertDataPoint,
  defaultInstrumentDescriptor,
  ObservableCallbackDelegate,
} from '../util';
import { ObservableInstrument } from '../../src/Instruments';
import { HrTime } from '@opentelemetry/api';

const deltaCollector: MetricCollectorHandle = {
  selectAggregationTemporality: () => AggregationTemporality.DELTA,
  selectCardinalityLimit: () => 2000,
};

const cumulativeCollector: MetricCollectorHandle = {
  selectAggregationTemporality: () => AggregationTemporality.CUMULATIVE,
  selectCardinalityLimit: () => 2000,
};

describe('AsyncMetricStorage', () => {
  describe('collect', () => {
    describe('Delta Collector', () => {
      it('should collect and reset memos', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(true),
          createNoopAttributesProcessor(),
          [deltaCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
          observableResult.observe(2, { key: '2' });
          observableResult.observe(3, { key: '3' });
        });
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 3);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            1,
            collectionTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[1],
            { key: '2' },
            2,
            collectionTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[2],
            { key: '3' },
            3,
            collectionTime,
            collectionTime
          );
        }

        delegate.setDelegate(observableResult => {});
        // The attributes should not be memorized if no measurement was reported.
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assert.equal(metric, undefined);
        }

        delegate.setDelegate(observableResult => {
          observableResult.observe(4, { key: '1' });
          observableResult.observe(5, { key: '2' });
          observableResult.observe(6, { key: '3' });
        });
        {
          const collectionTime: HrTime = [2, 2];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 3);
          // All values were diffed. StartTime is being reset for gaps.
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            3,
            collectionTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[1],
            { key: '2' },
            3,
            collectionTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[2],
            { key: '3' },
            3,
            collectionTime,
            collectionTime
          );
        }
      });

      it('should detect resets for monotonic sum metrics', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(true),
          createNoopAttributesProcessor(),
          [deltaCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        // Observe a metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(100, { key: '1' });
        });
        let lastCollectionTime: HrTime;
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            100,
            collectionTime,
            collectionTime
          );
          lastCollectionTime = collectionTime;
        }

        // Observe a drop on the metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
        });
        // The result data should not be diff-ed to be a negative value
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            1,
            lastCollectionTime,
            collectionTime
          );
          lastCollectionTime = collectionTime;
        }

        // Observe a new data point
        delegate.setDelegate(observableResult => {
          observableResult.observe(50, { key: '1' });
        });
        // The result data should now be a delta to the previous collection
        {
          const collectionTime: HrTime = [2, 2];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            49,
            lastCollectionTime,
            collectionTime
          );
        }
      });

      it('should not detect resets and gaps for non-monotonic sum metrics', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(false),
          createNoopAttributesProcessor(),
          [deltaCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        // Observe a metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(100, { key: '1' });
        });
        let lastCollectionTime: HrTime;
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            100,
            collectionTime,
            collectionTime
          );
          lastCollectionTime = collectionTime;
        }

        // Observe a drop on the metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
        });
        // The result data should be a delta to the previous collection
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            -99,
            lastCollectionTime,
            collectionTime
          );
          lastCollectionTime = collectionTime;
        }

        // Observe a new data point
        delegate.setDelegate(observableResult => {
          observableResult.observe(50, { key: '1' });
        });
        // The result data should be a delta to the previous collection
        {
          const collectionTime: HrTime = [2, 2];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            49,
            lastCollectionTime,
            collectionTime
          );
        }
      });

      it('should not report attribute sets not observed in the current callback', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(true),
          createNoopAttributesProcessor(),
          [deltaCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        // First cycle: observe two attribute sets
        delegate.setDelegate(observableResult => {
          observableResult.observe(10, { key: '1' });
          observableResult.observe(20, { key: '2' });
        });
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 2);
        }

        // Second cycle: only observe one attribute set — the other must not appear
        delegate.setDelegate(observableResult => {
          observableResult.observe(15, { key: '1' });
        });
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(deltaCollector, collectionTime);

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            5,
            [0, 0],
            collectionTime
          );
        }
      });
    });

    describe('Cumulative Collector', () => {
      it('should collect cumulative metrics', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(true),
          createNoopAttributesProcessor(),
          [cumulativeCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
          observableResult.observe(2, { key: '2' });
          observableResult.observe(3, { key: '3' });
        });
        let startTime: HrTime;
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          startTime = collectionTime;
          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 3);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            1,
            startTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[1],
            { key: '2' },
            2,
            startTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[2],
            { key: '3' },
            3,
            startTime,
            collectionTime
          );
        }

        delegate.setDelegate(observableResult => {});
        // Per spec: attribute sets NOT observed in the current callback SHOULD NOT be reported.
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assert.equal(metric, undefined);
        }

        delegate.setDelegate(observableResult => {
          observableResult.observe(4, { key: '1' });
          observableResult.observe(5, { key: '2' });
          observableResult.observe(6, { key: '3' });
        });
        {
          const collectionTime: HrTime = [2, 2];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 3);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            4,
            startTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[1],
            { key: '2' },
            5,
            startTime,
            collectionTime
          );
          assertDataPoint(
            metric.dataPoints[2],
            { key: '3' },
            6,
            startTime,
            collectionTime
          );
        }
      });

      it('should not report attribute sets not observed in the current callback', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(true),
          createNoopAttributesProcessor(),
          [cumulativeCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        // T0: observe 3 attribute sets
        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
          observableResult.observe(2, { key: '2' });
          observableResult.observe(3, { key: '3' });
        });
        let startTime: HrTime;
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );
          startTime = collectionTime;
          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 3);
        }

        // T1: observe only one attribute set - the others SHOULD NOT be reported
        delegate.setDelegate(observableResult => {
          observableResult.observe(5, { key: '1' });
        });
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            5,
            startTime,
            collectionTime
          );
        }

        // T2: observe key:1 and key:3 (key:2 was never re-observed; key:3 reappears)
        delegate.setDelegate(observableResult => {
          observableResult.observe(8, { key: '1' });
          observableResult.observe(10, { key: '3' });
        });
        {
          const collectionTime: HrTime = [2, 2];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 2);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            8,
            startTime,
            collectionTime
          );
          // key:3 reappears; cumulative history is preserved from T0
          assertDataPoint(
            metric.dataPoints[1],
            { key: '3' },
            10,
            startTime,
            collectionTime
          );
        }
      });

      it('should not cross-pollute between collectors', async () => {
        const anotherCumulativeCollector: MetricCollectorHandle = {
          selectAggregationTemporality: () => AggregationTemporality.CUMULATIVE,
          selectCardinalityLimit: () => 2000,
        };

        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(true),
          createNoopAttributesProcessor(),
          [cumulativeCollector, anotherCumulativeCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        // T0: observe 2 attribute sets
        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
          observableResult.observe(2, { key: '2' });
        });
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          metricStorage.collect(cumulativeCollector, collectionTime);
          metricStorage.collect(anotherCumulativeCollector, collectionTime);
        }

        // T1: callback observes nothing
        delegate.setDelegate(observableResult => {});
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric1 = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );
          const metric2 = metricStorage.collect(
            anotherCumulativeCollector,
            collectionTime
          );

          // Both collectors should see no data
          assert.equal(metric1, undefined);
          assert.equal(metric2, undefined);
        }
      });

      it('should collect monotonic metrics with resets and gaps', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(true),
          createNoopAttributesProcessor(),
          [cumulativeCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        // Observe a metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(100, { key: '1' });
        });
        let startTime: HrTime;
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          startTime = collectionTime;
          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            100,
            startTime,
            collectionTime
          );
        }

        // Observe a drop on the metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
        });
        // The result data should not be diff-ed to be a negative value
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          // The startTime should be reset.
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            1,
            collectionTime,
            collectionTime
          );
          startTime = collectionTime;
        }

        // Observe a new data point
        delegate.setDelegate(observableResult => {
          observableResult.observe(50, { key: '1' });
        });
        // The result data should now be a delta to the previous collection
        {
          const collectionTime: HrTime = [2, 2];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            50,
            startTime,
            collectionTime
          );
        }
      });

      it('should collect non-monotonic metrics with resets and gaps', async () => {
        const delegate = new ObservableCallbackDelegate();
        const observableRegistry = new ObservableRegistry();
        const metricStorage = new AsyncMetricStorage(
          defaultInstrumentDescriptor,
          new SumAggregator(false),
          createNoopAttributesProcessor(),
          [cumulativeCollector]
        );

        const observable = new ObservableInstrument(
          defaultInstrumentDescriptor,
          [metricStorage],
          observableRegistry
        );

        observableRegistry.addCallback(delegate.getCallback(), observable);

        // Observe a metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(100, { key: '1' });
        });
        let startTime: HrTime;
        {
          const collectionTime: HrTime = [0, 0];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          startTime = collectionTime;
          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            100,
            startTime,
            collectionTime
          );
        }

        // Observe a drop on the metric
        delegate.setDelegate(observableResult => {
          observableResult.observe(1, { key: '1' });
        });
        // The result data should be a delta to the previous collection
        {
          const collectionTime: HrTime = [1, 1];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          // No reset on the value or the startTime
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            1,
            startTime,
            collectionTime
          );
        }

        // Observe a new data point
        delegate.setDelegate(observableResult => {
          observableResult.observe(50, { key: '1' });
        });
        // The result data should be a delta to the previous collection
        {
          const collectionTime: HrTime = [2, 2];
          await observableRegistry.observe(collectionTime);
          const metric = metricStorage.collect(
            cumulativeCollector,
            collectionTime
          );

          assertMetricData(metric, DataPointType.SUM);
          assert.strictEqual(metric.dataPoints.length, 1);
          assertDataPoint(
            metric.dataPoints[0],
            { key: '1' },
            50,
            startTime,
            collectionTime
          );
        }
      });
    });
  });
});
