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
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { Readable } from 'stream';
import { IExportResponse, HttpRequestParameters } from './http-transport-types';

export const DEFAULT_EXPORT_MAX_ATTEMPTS = 5;
export const DEFAULT_EXPORT_INITIAL_BACKOFF = 1000;
export const DEFAULT_EXPORT_MAX_BACKOFF = 5000;
export const DEFAULT_EXPORT_BACKOFF_MULTIPLIER = 1.5;

function isExportRetryable(statusCode: number): boolean {
  const retryCodes = [429, 502, 503, 504];
  return retryCodes.includes(statusCode);
}

function parseRetryAfterToMills(retryAfter?: string | null): number {
  if (retryAfter == null) {
    return -1;
  }
  const seconds = Number.parseInt(retryAfter, 10);
  if (Number.isInteger(seconds)) {
    return seconds > 0 ? seconds * 1000 : -1;
  }
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After#directives
  const delay = new Date(retryAfter).getTime() - Date.now();

  if (delay >= 0) {
    return delay;
  }
  return 0;
}

/**
 * Sends data using http
 * @param params
 * @param agent
 * @param data
 * @param onSuccess
 * @param onError
 */
export function sendWithHttp(
  params: HttpRequestParameters,
  agent: http.Agent | https.Agent,
  data: Buffer,
  onSuccess: (response: IExportResponse) => void,
  onError: (error: Error) => void
): void {
  const exporterTimeout = params.timeoutMillis;
  const parsedUrl = new URL(params.url);
  const nodeVersion = Number(process.versions.node.split('.')[0]);
  let retryTimer: ReturnType<typeof setTimeout>;
  let req: http.ClientRequest;
  let reqIsDestroyed = false;

  const exporterTimer = setTimeout(() => {
    clearTimeout(retryTimer);
    reqIsDestroyed = true;

    if (req.destroyed) {
      const err = new Error('Request Timeout');
      onError(err);
    } else {
      // req.abort() was deprecated since v14
      nodeVersion >= 14 ? req.destroy() : req.abort();
    }
  }, exporterTimeout);

  const options: http.RequestOptions | https.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      ...params.headers,
    },
    agent: agent,
  };

  const request = parsedUrl.protocol === 'http:' ? http.request : https.request;

  const sendWithRetry = (
    retries = DEFAULT_EXPORT_MAX_ATTEMPTS,
    minDelay = DEFAULT_EXPORT_INITIAL_BACKOFF
  ) => {
    req = request(options, (res: http.IncomingMessage) => {
      const responseData: Buffer[] = [];
      res.on('data', chunk => responseData.push(chunk));

      res.on('aborted', () => {
        if (reqIsDestroyed) {
          const err = new Error('Request Timeout');
          onError(err);
        }
      });

      res.on('end', () => {
        if (reqIsDestroyed === false) {
          if (res.statusCode && res.statusCode < 299) {
            onSuccess({
              status: 'success',
              data: Buffer.concat(responseData),
            });
            // clear all timers since request was completed and promise was resolved
            clearTimeout(exporterTimer);
            clearTimeout(retryTimer);
          } else if (
            res.statusCode &&
            isExportRetryable(res.statusCode) &&
            retries > 0
          ) {
            let retryTime: number;
            minDelay = DEFAULT_EXPORT_BACKOFF_MULTIPLIER * minDelay;

            // retry after interval specified in Retry-After header
            if (res.headers['retry-after']) {
              retryTime = parseRetryAfterToMills(res.headers['retry-after']!);
            } else {
              // exponential backoff with jitter
              retryTime = Math.round(
                Math.random() * (DEFAULT_EXPORT_MAX_BACKOFF - minDelay) +
                  minDelay
              );
            }

            retryTimer = setTimeout(() => {
              sendWithRetry(retries - 1, minDelay);
            }, retryTime);
          } else {
            const error = new Error(
              `${res.statusMessage} + ${res.statusCode} + ${responseData}`
            );
            onError(error);
            // clear all timers since request was completed and promise was resolved
            clearTimeout(exporterTimer);
            clearTimeout(retryTimer);
          }
        }
      });
    });

    req.on('error', (error: Error | any) => {
      if (reqIsDestroyed) {
        const err = new Error('Request Timeout');
        onError(err);
      } else {
        onError(error);
      }
      clearTimeout(exporterTimer);
      clearTimeout(retryTimer);
    });

    req.on('abort', () => {
      if (reqIsDestroyed) {
        const err = new Error('Request Timeout');
        onError(err);
      }
      clearTimeout(exporterTimer);
      clearTimeout(retryTimer);
    });

    switch (params.compression) {
      case 'gzip': {
        req.setHeader('Content-Encoding', 'gzip');
        const dataStream = readableFromBuffer(data);
        dataStream
          .on('error', onError)
          .pipe(zlib.createGzip())
          .on('error', onError)
          .pipe(req);

        break;
      }
      default:
        req.end(data);
        break;
    }
  };
  sendWithRetry();
}

function readableFromBuffer(buff: string | Buffer): Readable {
  const readable = new Readable();
  readable.push(buff);
  readable.push(null);

  return readable;
}

export function createHttpAgent(
  rawUrl: string,
  agentOptions: http.AgentOptions | https.AgentOptions
) {
  const parsedUrl = new URL(rawUrl);
  const Agent = parsedUrl.protocol === 'http:' ? http.Agent : https.Agent;
  return new Agent(agentOptions);
}
