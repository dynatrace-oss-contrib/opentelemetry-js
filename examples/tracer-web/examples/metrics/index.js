const { DiagConsoleLogger, DiagLogLevel, diag } = require('@opentelemetry/api');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics-base');

// Optional and only needed to see the internal diagnostic logging (during development)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const metricExporter = new OTLPMetricExporter();

let interval;
let meter;

function stopMetrics() {
  console.log('STOPPING METRICS');
  clearInterval(interval);
  meter.shutdown();
}

function startMetrics() {
  console.log('STARTING METRICS');

  const meterProvider = new MeterProvider();

  meterProvider.addMetricReader(new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 1000
  }));

  meter = meterProvider.getMeter('example-exporter-collector')

  const requestCounter = meter.createCounter('requests', {
    description: 'Example of a Counter',
  });

  const upDownCounter = meter.createUpDownCounter('test_up_down_counter', {
    description: 'Example of a UpDownCounter',
  });

  const attributes = { environment: 'staging' };

  interval = setInterval(() => {
    requestCounter.add(1, attributes);
    upDownCounter.add(Math.random() > 0.5 ? 1 : -1, attributes);
  }, 1000);
}

const addClickEvents = () => {
  const startBtn = document.getElementById('startBtn');

  const stopBtn = document.getElementById('stopBtn');
  startBtn.addEventListener('click', startMetrics);
  stopBtn.addEventListener('click', stopMetrics);
};

window.addEventListener('load', addClickEvents);
