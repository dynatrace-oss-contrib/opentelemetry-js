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

import { createProtobufMetricsTransformer } from '../../../src/metrics/protobuf/metrics-transformer';
import * as sinon from 'sinon';
import { createExportMetricsServiceRequest } from '@opentelemetry/otlp-transformer';
import { resourceMetrics } from '../fixtures/resource-metrics';
import * as assert from 'assert';

describe('protobuf metrics-transformer', function () {
  beforeEach(function () {
    sinon.restore();
  });

  it('wraps item in array', () => {
    const createServiceRequestSpy = sinon.spy(
      createExportMetricsServiceRequest
    );
    const transformer = createProtobufMetricsTransformer();

    transformer.transform(resourceMetrics);

    createServiceRequestSpy.calledOnceWithExactly([resourceMetrics]);
  });

  it('result equals the transformer package exactly', () => {
    const transformer = createProtobufMetricsTransformer();
    assert.deepStrictEqual(
      transformer.transform(resourceMetrics),
      createExportMetricsServiceRequest([resourceMetrics])
    );
  });
});
