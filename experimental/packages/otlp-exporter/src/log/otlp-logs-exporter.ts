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

import { ExportResult } from '@opentelemetry/core';
import { IOLTPExportDelegate } from '../common/interface-otlp-export-delegate';
import { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';

// This is currently a placeholder so that signal-specific functionality can be added here in the future if needed.
export class OTLPTracesExporter implements LogRecordExporter {
  constructor(private _delegate: IOLTPExportDelegate<ReadableLogRecord[]>) {}

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this._delegate.export(logs, resultCallback);
  }

  forceFlush(): Promise<void> {
    return this._delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this._delegate.forceFlush();
  }
}
