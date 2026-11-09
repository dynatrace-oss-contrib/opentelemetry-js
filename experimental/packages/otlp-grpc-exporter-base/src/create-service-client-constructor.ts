/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// NOTE: do not change this to a value import. The bundler hoists module-level imports, which would load
// '@grpc/grpc-js' before instrumentations (net, dns, http) can wrap the core modules it requires.
import type { ServiceClientConstructor } from '@grpc/grpc-js';

/**
 * Creates a unary service client constructor that, when instantiated, does not serialize/deserialize anything.
 * Allows for passing in {@link Buffer} directly, serialization can be handled via protobufjs or custom implementations.
 *
 * @param path service path
 * @param name service name
 */
export function createServiceClientConstructor(
  path: string,
  name: string
): ServiceClientConstructor {
  // Lazy-load so that we don't need to require/import '@grpc/grpc-js' before it can be wrapped by instrumentation.
  const { makeGenericClientConstructor } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
    require('@grpc/grpc-js') as typeof import('@grpc/grpc-js');

  const serviceDefinition = {
    export: {
      path: path,
      requestStream: false,
      responseStream: false,
      requestSerialize: (arg: Buffer) => {
        return arg;
      },
      requestDeserialize: (arg: Buffer) => {
        return arg;
      },
      responseSerialize: (arg: Buffer) => {
        return arg;
      },
      responseDeserialize: (arg: Buffer) => {
        return arg;
      },
    },
  };

  return makeGenericClientConstructor(serviceDefinition, name);
}
