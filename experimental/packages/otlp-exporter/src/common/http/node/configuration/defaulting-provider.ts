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
import { IConfigurationProvider } from '../../../configuration/provider';
import { NodeHttpConfiguration } from './configuration';

const DEFAULT_CONFIGURATION: NodeHttpConfiguration = {
  agentOptions: {
    keepAlive: true,
  },
};

export class DefaultingNodeHttpConfigurationProvider
  implements IConfigurationProvider<NodeHttpConfiguration>
{
  /**
   * No fallback exists as these options cannot be set via environment variables
   * @param _userProvidedConfiguration
   */
  constructor(
    private _userProvidedConfiguration: Partial<NodeHttpConfiguration>
  ) {}
  provide(): NodeHttpConfiguration {
    if (this._userProvidedConfiguration.agentOptions == null) {
      return DEFAULT_CONFIGURATION;
    }
    return {
      agentOptions: this._userProvidedConfiguration.agentOptions,
    };
  }
}
