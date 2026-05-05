const metrics = { requests: {}, durations: {} };
function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics' || req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const normalizedPath = req.path.replace(/\/\d+/g, '/:id');
    const key = req.method + ':' + normalizedPath + ':' + res.statusCode;
    metrics.requests[key] = (metrics.requests[key] || 0) + 1;
    if (!metrics.durations[normalizedPath]) metrics.durations[normalizedPath] = [];
    metrics.durations[normalizedPath].push(duration);
    if (metrics.durations[normalizedPath].length > 200) metrics.durations[normalizedPath].shift();
  });
  next();
}
function generateMetrics(serviceName, extraGauges = {}) {
  const lines = [];
  lines.push('# HELP ' + serviceName + '_requests_total Total HTTP requests');
  lines.push('# TYPE ' + serviceName + '_requests_total counter');
  for (const [key, count] of Object.entries(metrics.requests)) {
    const [method, path, status] = key.split(':');
    lines.push(serviceName + '_requests_total{method="' + method + '",path="' + path + '",status="' + status + '"} ' + count);
  }
  lines.push('# HELP ' + serviceName + '_request_duration_ms Avg duration ms');
  lines.push('# TYPE ' + serviceName + '_request_duration_ms gauge');
  for (const [path, durations] of Object.entries(metrics.durations)) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    lines.push(serviceName + '_request_duration_ms{path="' + path + '"} ' + avg.toFixed(2));
  }
  lines.push('# HELP ' + serviceName + '_uptime_seconds Uptime in seconds');
  lines.push('# TYPE ' + serviceName + '_uptime_seconds counter');
  lines.push(serviceName + '_uptime_seconds ' + Math.floor(process.uptime()));
  const mem = process.memoryUsage();
  lines.push('# HELP ' + serviceName + '_memory_bytes RSS memory in bytes');
  lines.push('# TYPE ' + serviceName + '_memory_bytes gauge');
  lines.push(serviceName + '_memory_bytes ' + mem.rss);
  for (const [name, value] of Object.entries(extraGauges)) {
    lines.push('# HELP ' + serviceName + '_' + name);
    lines.push('# TYPE ' + serviceName + '_' + name + ' gauge');
    lines.push(serviceName + '_' + name + ' ' + value);
  }
  return lines.join(String.fromCharCode(10));
}
module.exports = { metricsMiddleware, generateMetrics };
