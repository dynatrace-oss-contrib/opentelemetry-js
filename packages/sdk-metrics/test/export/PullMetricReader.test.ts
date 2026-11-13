/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import type {
  AggregationOption,
  MetricProducer,
  PullMetricExporter,
} from '../../src';
import {
  AggregationTemporality,
  AggregationType,
  InstrumentType,
  MeterProvider,
  PullMetricReader,
} from '../../src';
import {
  DEFAULT_AGGREGATION_SELECTOR,
  DEFAULT_AGGREGATION_TEMPORALITY_SELECTOR,
} from '../../src/export/AggregationSelector';
import { TestMetricProducer } from './TestMetricProducer';
import {
  assertAggregationSelector,
  assertAggregationTemporalitySelector,
} from './utils';
import { testResource } from '../util';

class TestPullMetricExporter implements PullMetricExporter {
  public producer?: MetricProducer;
  public shutdownCalls = 0;

  setMetricProducer(metricProducer: MetricProducer): void {
    if (this.producer) {
      throw new Error('producer already set');
    }
    this.producer = metricProducer;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls++;
  }

  scrape() {
    assert.ok(this.producer, 'producer not set');
    return this.producer.collect();
  }
}

class SelectingPullMetricExporter extends TestPullMetricExporter {
  selectAggregation(_instrumentType: InstrumentType): AggregationOption {
    return { type: AggregationType.LAST_VALUE };
  }
  selectAggregationTemporality(
    _instrumentType: InstrumentType
  ): AggregationTemporality {
    return AggregationTemporality.DELTA;
  }
}

describe('PullMetricReader', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('hands a producer to the exporter on construction', () => {
    const exporter = new TestPullMetricExporter();
    new PullMetricReader({ exporter });
    assert.ok(exporter.producer);
  });

  it('rejects scrapes before being registered with a MeterProvider', async () => {
    const exporter = new TestPullMetricExporter();
    new PullMetricReader({ exporter });
    await assert.rejects(exporter.scrape(), /not bound to a MetricProducer/);
  });

  it('collects SDK metrics and additional producers on scrape', async () => {
    const exporter = new TestPullMetricExporter();
    const additionalProducer = new TestMetricProducer({
      resourceMetrics: {
        resource: testResource,
        scopeMetrics: [{ scope: { name: 'additionalScope' }, metrics: [] }],
      },
    });
    const reader = new PullMetricReader({
      exporter,
      metricProducers: [additionalProducer],
    });
    const meterProvider = new MeterProvider({
      resource: testResource,
      readers: [reader],
    });
    meterProvider.getMeter('sdkScope').createCounter('c').add(1);

    const { resourceMetrics, errors } = await exporter.scrape();
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(
      resourceMetrics.scopeMetrics.map(sm => sm.scope.name),
      ['sdkScope', 'additionalScope']
    );
    assert.strictEqual(
      resourceMetrics.scopeMetrics[0].metrics[0].descriptor.name,
      'c'
    );
  });

  it('uses default selectors when the exporter has none', () => {
    const reader = new PullMetricReader({
      exporter: new TestPullMetricExporter(),
    });
    assertAggregationSelector(reader, DEFAULT_AGGREGATION_SELECTOR);
    assertAggregationTemporalitySelector(
      reader,
      DEFAULT_AGGREGATION_TEMPORALITY_SELECTOR
    );
  });

  it('uses the exporter selectors', () => {
    const exporter = new SelectingPullMetricExporter();
    const reader = new PullMetricReader({ exporter });
    assertAggregationSelector(reader, () => ({
      type: AggregationType.LAST_VALUE,
    }));
    assertAggregationTemporalitySelector(
      reader,
      () => AggregationTemporality.DELTA
    );
  });

  it('applies cardinality limits', () => {
    const reader = new PullMetricReader({
      exporter: new TestPullMetricExporter(),
      cardinalityLimits: { counter: 10, default: 20 },
    });
    assert.strictEqual(
      reader.selectCardinalityLimit(InstrumentType.COUNTER),
      10
    );
    assert.strictEqual(
      reader.selectCardinalityLimit(InstrumentType.HISTOGRAM),
      20
    );
  });

  it('defaults the cardinality limit to 2000', () => {
    const reader = new PullMetricReader({
      exporter: new TestPullMetricExporter(),
    });
    assert.strictEqual(
      reader.selectCardinalityLimit(InstrumentType.COUNTER),
      2000
    );
  });

  it('forceFlush does not touch the exporter', async () => {
    const exporter = new TestPullMetricExporter();
    const reader = new PullMetricReader({ exporter });
    await reader.forceFlush();
    assert.strictEqual(exporter.shutdownCalls, 0);
  });

  it('shuts down the exporter and rejects scrapes afterwards', async () => {
    const exporter = new TestPullMetricExporter();
    const reader = new PullMetricReader({ exporter });
    new MeterProvider({ readers: [reader] });

    await reader.shutdown();
    assert.strictEqual(exporter.shutdownCalls, 1);
    await assert.rejects(exporter.scrape(), /MetricReader is shutdown/);
  });
});
