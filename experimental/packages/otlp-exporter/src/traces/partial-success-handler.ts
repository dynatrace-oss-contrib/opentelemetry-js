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

import { IExportTraceServiceResponse } from '@opentelemetry/otlp-transformer';
import { diag } from '@opentelemetry/api';
import { IOTLPResponseHandler } from '../common/response-handler';

export function createTracesPartialSuccessHandler(): IOTLPResponseHandler<IExportTraceServiceResponse> {
  return {
    handleResponse(response: IExportTraceServiceResponse) {
      if (response.partialSuccess != null) {
        diag.warn(
          `Export succeeded partially, rejected spans: ${response.partialSuccess.rejectedSpans}, message:\n${response.partialSuccess.errorMessage}`
        );
      }
    },
  };
}
