'use strict';

const {registerInstrumentations} = require('@opentelemetry/instrumentation');
const {NodeTracerProvider} = require('@opentelemetry/sdk-trace-node');
const {Resource} = require('@opentelemetry/resources');
const {SemanticResourceAttributes} = require('@opentelemetry/semantic-conventions');
const { SimpleSpanProcessor} = require('@opentelemetry/sdk-trace-base');
const {GrpcInstrumentation} = require('@opentelemetry/instrumentation-grpc');
const {OTLPTraceExporter} = require('@opentelemetry/exporter-trace-otlp-proto');

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "js-client",
  })
});

registerInstrumentations({
  instrumentations: [new GrpcInstrumentation()],
});


provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({})));

provider.register();
