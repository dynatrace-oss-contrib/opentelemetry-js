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

export interface IExportPromiseQueue {
  pushPromise(promise: Promise<void>): void;
  hasReachedLimit(): boolean;
  awaitAll(): Promise<void>;
}

/**
 * Promise queue for keeping track of export promises. Finished promises will be auto-dequeued.
 * Allows for awaiting all promises in the queue.
 *
 * TODO: this still has some confusing behavior on enqueue.
 */
export class ExportPromiseQueue implements IExportPromiseQueue {
  private readonly _concurrencyLimit: number;
  private _sendingPromises: Promise<unknown>[] = [];

  /**
   * @param concurrencyLimit maximum promises allowed in a queue at the same time.
   */
  constructor(concurrencyLimit: number) {
    this._concurrencyLimit = concurrencyLimit;
  }

  public pushPromise(promise: Promise<void>): void {
    this._sendingPromises.push(promise);
    const popPromise = () => {
      const index = this._sendingPromises.indexOf(promise);
      this._sendingPromises.splice(index, 1);
    };
    promise.then(popPromise, popPromise);
  }

  public hasReachedLimit(): boolean {
    return this._sendingPromises.length >= this._concurrencyLimit;
  }

  public awaitAll(): Promise<void> {
    return Promise.all(this._sendingPromises).then(() => {
      /** ignore resolved values */
    });
  }
}
