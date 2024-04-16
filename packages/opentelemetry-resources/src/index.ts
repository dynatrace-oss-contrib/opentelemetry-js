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

export { Resource } from './Resource';
export { IResource } from './IResource';
export {
  processDetector,
  processDetectorSync,
  hostDetectorSync,
  osDetector,
  osDetectorSync,
  hostDetector,
  serviceInstanceIdDetectorSync,
  defaultServiceName,
} from './platform';
export { ResourceAttributes, DetectorSync, Detector } from './types';
export { ResourceDetectionConfig } from './config';
export {
  browserDetector,
  browserDetectorSync,
  envDetectorSync,
  envDetector,
} from './detectors';
export { detectResourcesSync, detectResources } from './detect-resources';
