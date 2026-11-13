/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AggregationTemporality,
  AggregationType,
  InstrumentType,
  MeterProvider,
  MetricReader,
  PullMetricReader,
} from '@opentelemetry/sdk-metrics';
import * as assert from 'assert';
import * as http from 'http';
import * as sinon from 'sinon';
import { PrometheusExporter, PrometheusMetricExporter } from '../src';
import { mockHrTime } from './util';

function request(url: string): Promise<{ statusCode?: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

describe('PrometheusMetricExporter', () => {
  beforeEach(() => {
    mockHrTime();
  });
  afterEach(() => {
    sinon.restore();
  });

  it('selects cumulative temporality and default aggregation', () => {
    const exporter = new PrometheusMetricExporter({ preventServerStart: true });
    assert.strictEqual(
      exporter.selectAggregationTemporality(),
      AggregationTemporality.CUMULATIVE
    );
    assert.deepStrictEqual(exporter.selectAggregation(), {
      type: AggregationType.DEFAULT,
    });

    const reader = new PullMetricReader({ exporter });
    assert.strictEqual(
      reader.selectAggregationTemporality(InstrumentType.HISTOGRAM),
      AggregationTemporality.CUMULATIVE
    );
  });

  it('throws when bound to a second reader', () => {
    const exporter = new PrometheusMetricExporter({ preventServerStart: true });
    new PullMetricReader({ exporter });
    assert.throws(
      () => new PullMetricReader({ exporter }),
      /can not be bound to a PullMetricReader again/
    );
  });

  it('reports an error when scraped without a reader', async () => {
    const exporter = new PrometheusMetricExporter({ port: 9471 });
    await exporter.startServer();
    try {
      const { body } = await request('http://localhost:9471/metrics');
      assert.match(
        body,
        /# failed to export metrics: .*not registered with a PullMetricReader/
      );
    } finally {
      await exporter.shutdown();
    }
  });

  it('serves SDK metrics and reader-level metricProducers', async () => {
    const exporter = new PrometheusMetricExporter({ port: 9472 });
    const reader = new PullMetricReader({
      exporter,
      metricProducers: [
        {
          collect: async () => {
            const other = new PullMetricReader({
              exporter: new PrometheusMetricExporter({
                preventServerStart: true,
              }),
            });
            const otherProvider = new MeterProvider({ readers: [other] });
            otherProvider
              .getMeter('additional')
              .createCounter('additional_counter')
              .add(3);
            return other.collect();
          },
        },
      ],
    });
    const meterProvider = new MeterProvider({ readers: [reader] });
    meterProvider.getMeter('test').createCounter('counter').add(10);
    await exporter.startServer();

    try {
      const { statusCode, body } = await request(
        'http://localhost:9472/metrics'
      );
      assert.strictEqual(statusCode, 200);
      assert.match(body, /^counter_total\{.*\} 10$/m);
      assert.match(body, /^additional_counter_total\{.*\} 3$/m);
    } finally {
      await meterProvider.shutdown();
    }
  });

  it('stops the server when the reader is shut down', async () => {
    const exporter = new PrometheusMetricExporter({ port: 9473 });
    const reader = new PullMetricReader({ exporter });
    await exporter.startServer();
    await reader.shutdown();
    assert.strictEqual(exporter['_server'].listening, false);
  });

  it('serves the same output as the deprecated PrometheusExporter', async () => {
    const newReader = new PullMetricReader({
      exporter: new PrometheusMetricExporter({ port: 9474 }),
    });
    const oldReader = new PrometheusExporter({ port: 9475 });
    assert.ok(oldReader instanceof MetricReader);
    assert.ok(oldReader instanceof PullMetricReader);

    const providers = [newReader, oldReader].map(reader => {
      const provider = new MeterProvider({ readers: [reader] });
      const meter = provider.getMeter('test');
      meter.createCounter('counter', { description: 'a counter' }).add(10, {
        key: 'value',
      });
      meter.createHistogram('histogram').record(5);
      return provider;
    });
    await Promise.all(
      [newReader['_exporter'] as PrometheusMetricExporter, oldReader].map(it =>
        it.startServer()
      )
    );

    try {
      const [newBody, oldBody] = await Promise.all([
        request('http://localhost:9474/metrics'),
        request('http://localhost:9475/metrics'),
      ]);
      assert.strictEqual(newBody.body, oldBody.body);
    } finally {
      await Promise.all(providers.map(p => p.shutdown()));
    }
  });
});
