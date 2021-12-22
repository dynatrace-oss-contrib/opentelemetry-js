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

import { PeriodicExportingMetricReader } from '../../src/export/PeriodicExportingMetricReader';
import { AggregationTemporality } from '../../src/export/AggregationTemporality';
import { MetricExporter } from '../../src';
import { MetricData } from '../../src/export/MetricData';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { MetricProducer } from '../../src/export/MetricProducer';
import { ReaderResultCode } from '../../src/export/ReaderResult';

const MAX_32_BIT_INT = 2 ** 31 - 1

class TestMetricExporter extends MetricExporter {
  public exportTime = 0;
  public throwException = false;
  private _batches: MetricData[][] = [];

  async export(batch: MetricData[]): Promise<void> {
    this._batches.push([]);

    if (this.throwException) {
      throw new Error('Error during export');
    }
    await new Promise(resolve => setTimeout(resolve, this.exportTime));
  }

  async forceFlush(): Promise<void> {
  }

  async waitForNumberOfExports(numberOfExports: number): Promise<MetricData[][]> {
    if (numberOfExports <= 0) {
      throw new Error('numberOfExports must be greater than or equal to 0');
    }

    while (this._batches.length < numberOfExports) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return this._batches.slice(0, numberOfExports);
  }

  getPreferredAggregationTemporality(): AggregationTemporality {
    return AggregationTemporality.CUMULATIVE;
  }
}

class TestDeltaMetricExporter extends TestMetricExporter {
  override getPreferredAggregationTemporality(): AggregationTemporality {
    return AggregationTemporality.DELTA;
  }
}

class TestMetricProducer implements MetricProducer {
  async collect(): Promise<MetricData[]> {
    return [];
  }
}

describe('PeriodicExportingMetricReader', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should construct PeriodicExportingMetricReader without exceptions', () => {
      const exporter = new TestDeltaMetricExporter();
      const reader = new PeriodicExportingMetricReader({
          exporter: exporter,
          exportIntervalMillis: 4000,
          exportTimeoutMillis: 3000
        }
      );
      assert.strictEqual(reader.getPreferredAggregationTemporality(), exporter.getPreferredAggregationTemporality());
    })

    it('should throw when interval less or equal to 0', () => {
      const exporter = new TestDeltaMetricExporter();
      assert.throws(() => new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: 0,
        exportTimeoutMillis: 0
      }), new Error('exportIntervalMillis must be greater than 0'));
    })

    it('should throw when timeout less or equal to 0', () => {
      const exporter = new TestDeltaMetricExporter();
      assert.throws(() => new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: 1,
        exportTimeoutMillis: 0
      }), new Error('exportTimeoutMillis must be greater than 0'));
    })

    it('should throw when timeout less or equal to interval', () => {
      const exporter = new TestDeltaMetricExporter();
      assert.throws(() => new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: 100,
        exportTimeoutMillis: 200
      }), new Error('exportIntervalMillis must be greater than or equal to exportTimeoutMillis'));
    })

    it('should not start exporting', async () => {
      const exporter = new TestDeltaMetricExporter();
      const exporterMock = sinon.mock(exporter);
      exporterMock.expects('export').never();

      new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: 1,
        exportTimeoutMillis: 1
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      exporterMock.verify();
    })
  });

  describe('setMetricProducer', () => {
    it('should start exporting periodically', async () => {
      const exporter = new TestMetricExporter();
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: 50,
        exportTimeoutMillis: 20
      });

      reader.setMetricProducer(new TestMetricProducer());
      const result = await exporter.waitForNumberOfExports(2);

      assert.deepEqual(result, [[], []]);
      await new Promise(resolve => reader.shutdown({ done: resolve }));
    });
  });

  describe('periodic export', () => {
    it('should keep running on export errors', async () => {
      const exporter = new TestMetricExporter();
      exporter.throwException = true;
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: 50,
        exportTimeoutMillis: 20
      });

      reader.setMetricProducer(new TestMetricProducer());

      const result = await exporter.waitForNumberOfExports(2);
      assert.deepEqual(result, [[], []]);

      exporter.throwException = false;
      await new Promise(resolve => reader.shutdown({ done: resolve }));
    });
  });

  describe('forceFlush', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('should force export', done => {
      const exporter = new TestMetricExporter();
      const exporterMock = sinon.mock(exporter);
      exporterMock.expects('export').calledOnceWithExactly([]);
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80
      });

      reader.setMetricProducer(new TestMetricProducer());
      reader.forceFlush({
        done: _result => {
          exporterMock.verify();
          reader.shutdown({ done: _result => done() });
        }
      });
    });

    it('should return TIMED_OUT when export takes too long', done => {
      const exporter = new TestMetricExporter();
      exporter.exportTime = 1000;

      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80,
      });

      reader.setMetricProducer(new TestMetricProducer());
      reader.forceFlush({
        timeoutMillis: 20,
        done: result => {
          assert.strictEqual(result.code, ReaderResultCode.TIMED_OUT);

          // cleanup.
          exporter.exportTime = 0;
          reader.shutdown({ done: _result => done() });
        }
      });
    });

    it('should return FAILED when handler throws', done => {
      const exporter = new TestMetricExporter();
      exporter.throwException = true;
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80,
      });

      reader.forceFlush({
        done: result => {
          assert.strictEqual(result.code, ReaderResultCode.FAILED);

          // cleanup.
          exporter.throwException = false;
          reader.shutdown({ done: _result => done() });
        }
      })
    });

    it('should return FAILED after shutdown', done => {
      const exporter = new TestMetricExporter();
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80,
      });

      reader.setMetricProducer(new TestMetricProducer());
      reader.shutdown({
        done: result => {
          assert.strictEqual(result.code, ReaderResultCode.SUCCESS);
          reader.forceFlush({
            done: forceFlushResult => {
              assert.strictEqual(forceFlushResult.code, ReaderResultCode.FAILED);
              done();
            }
          })
        }
      });
    });
  });

  describe('shutdown', () => {
    it('should export one last time', done => {
      const exporter = new TestMetricExporter();
      const exporterMock = sinon.mock(exporter);
      exporterMock.expects('export').calledOnceWithExactly([]);
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80
      });

      reader.setMetricProducer(new TestMetricProducer());
      reader.shutdown({
        done: _result => {
          exporterMock.verify();
          done();
        }
      });
    });

    it('should return TIMED_OUT when export takes too long', done => {
      const exporter = new TestMetricExporter();
      exporter.exportTime = 1000;

      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80,
      });

      reader.setMetricProducer(new TestMetricProducer());
      reader.shutdown({
        timeoutMillis: 20, done: result => {
          assert.strictEqual(result.code, ReaderResultCode.TIMED_OUT);
          done();
        }
      });
    });

    it('should return FAILED when called twice', done => {
      const exporter = new TestMetricExporter();
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80
      });

      reader.setMetricProducer(new TestMetricProducer());

      // first call should succeed.
      reader.shutdown({
        done: result => {
          assert.strictEqual(result.code, ReaderResultCode.SUCCESS);

          //second call should fail
          reader.shutdown({
            done: secondResult => {
              assert.strictEqual(secondResult.code, ReaderResultCode.FAILED);
              done();
            }
          })
        }
      });
    });

    it('should return FAILED when shutdown-handler throws.', done => {
      const exporter = new TestMetricExporter();
      exporter.throwException = true;
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80,
      });

      reader.shutdown({
          done: result => {
            assert.strictEqual(result.code, ReaderResultCode.FAILED);
            done();
          }
        },
      );
    });
  });

  describe('collect', () => {
    it('should return FAILED on non-initialized instance', done => {
      const exporter = new TestMetricExporter();
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80,
      });

      reader.collect({
        done: (result => {
          assert.strictEqual(result.code, ReaderResultCode.FAILED);
          done();
        })
      });
    });

    it('should return FAILED on shut-down instance', done => {
      const exporter = new TestMetricExporter();
      const reader = new PeriodicExportingMetricReader({
        exporter: exporter,
        exportIntervalMillis: MAX_32_BIT_INT,
        exportTimeoutMillis: 80,
      });

      reader.setMetricProducer(new TestMetricProducer());

      reader.shutdown({
        done: _result => {
          reader.collect({
            done: (result => {
              assert.strictEqual(result.code, ReaderResultCode.FAILED);
              done();
            })
          });
        }
      });
    });
  })
});
