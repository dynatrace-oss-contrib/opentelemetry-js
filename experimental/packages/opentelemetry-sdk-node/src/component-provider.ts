/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TextMapPropagator } from '@opentelemetry/api';
import type { ResourceDetector } from '@opentelemetry/resources';
import type {
  LogRecordExporter,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import type {
  MetricProducer,
  PullMetricExporter,
  PushMetricExporter,
} from '@opentelemetry/sdk-metrics';
import type {
  IdGenerator,
  Sampler,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace';

/**
 * Schemaless configuration properties passed to a component provider.
 */
export type ConfigProperties = Record<string, unknown>;

// These `*ComponentProvider` aliases are defined to make
// `type ComponentProviderRegistry` more readable;
export type ExperimentalResourceDetectorComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => ResourceDetector;
export type TextMapPropagatorComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => TextMapPropagator;
export type SpanExporterComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => SpanExporter;
export type SpanProcessorComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => SpanProcessor;
export type SamplerComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => Sampler;
export type IdGeneratorComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => IdGenerator;
export type PullMetricExporterComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => PullMetricExporter;
export type PushMetricExporterComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => PushMetricExporter;
export type MetricProducerComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => MetricProducer;
export type LogRecordExporterComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => LogRecordExporter;
export type LogRecordProcessorComponentProvider = (
  reg: ComponentProviderRegistry,
  props: ConfigProperties
) => LogRecordProcessor;

/**
 * The built component provider registry maps component *name* (the string name
 * in a declarative config .yaml file) to a provider implementation.
 *
 * Supported component types (the keys) are the config types in this table:
 * https://opentelemetry.io/docs/specs/otel/configuration/sdk/#supported-sdk-plugin-components
 * (with the exception of ResourceDetection).
 */
export type ComponentProviderRegistry = {
  /**
   * @experimental The resource detector component provider interface is not stable.
   */
  ExperimentalResourceDetector?: Record<
    string,
    ExperimentalResourceDetectorComponentProvider
  >;

  TextMapPropagator?: Record<string, TextMapPropagatorComponentProvider>;
  SpanExporter?: Record<string, SpanExporterComponentProvider>;
  SpanProcessor?: Record<string, SpanProcessorComponentProvider>;
  Sampler?: Record<string, SamplerComponentProvider>;
  IdGenerator?: Record<string, IdGeneratorComponentProvider>;

  PullMetricExporter?: Record<string, PullMetricExporterComponentProvider>;
  PushMetricExporter?: Record<string, PushMetricExporterComponentProvider>;
  MetricProducer?: Record<string, MetricProducerComponentProvider>;

  LogRecordExporter?: Record<string, LogRecordExporterComponentProvider>;
  LogRecordProcessor?: Record<string, LogRecordProcessorComponentProvider>;
};

// Every key of `ComponentProviderRegistry` must be listed here (checked by
// `satisfies`), otherwise `mergeComponentProviderRegistries` would drop it.
const COMPONENT_TYPES = Object.keys({
  ExperimentalResourceDetector: true,
  TextMapPropagator: true,
  SpanExporter: true,
  SpanProcessor: true,
  Sampler: true,
  IdGenerator: true,
  PullMetricExporter: true,
  PushMetricExporter: true,
  MetricProducer: true,
  LogRecordExporter: true,
  LogRecordProcessor: true,
} satisfies Record<
  keyof ComponentProviderRegistry,
  true
>) as (keyof ComponentProviderRegistry)[];

/**
 * Merge multiple `ComponentProviderRegistry`'s into one.
 *
 * @throws {Error} if two attempt to provide for the same component type and
 *  name.
 */
export function mergeComponentProviderRegistries(
  regs: ComponentProviderRegistry[]
): ComponentProviderRegistry {
  const mergedReg: ComponentProviderRegistry = {};
  for (const reg of regs) {
    for (const componentType of COMPONENT_TYPES) {
      const providerFromName = reg[componentType];
      if (providerFromName !== undefined) {
        for (const name of Object.keys(providerFromName)) {
          if (
            mergedReg[componentType] !== undefined &&
            Object.prototype.hasOwnProperty.call(mergedReg[componentType], name)
          ) {
            throw new Error(
              `a ComponentProvider of type "${componentType}" and name="${name}" is already registered`
            );
          } else {
            mergedReg[componentType] ??= {};
            // The `!` is used because tsc doesn't infer existence from `??= {}` above.
            mergedReg[componentType]![name] = providerFromName[name];
          }
        }
      }
    }
  }
  return mergedReg;
}
