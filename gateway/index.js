const express = require('express');
const axios = require('axios');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const { rateLimiter } = require('./rate-limiter');
const { withRetry } = require('./retry');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'gateway';

const CATALOGUE_URL = process.env.CATALOGUE_URL || 'http://catalogue:3001';
const PANIER_URL = process.env.PANIER_URL || 'http://panier:3002';
const COMMANDES_URL = process.env.COMMANDES_URL || 'http://commandes:3003';
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_URL || 'http://notifications:3004';

app.use(express.json());
app.use(rateLimiter);

// Logging Middleware
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/metrics') return next();
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request handled', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
    });
  });
  next();
});

app.use(metricsMiddleware);

// Aggregated Health Check
app.get('/health', async (req, res) => {
  const start = Date.now();
  const services = {
    catalogue: CATALOGUE_URL,
    panier: PANIER_URL,
    commandes: COMMANDES_URL,
    notifications: NOTIFICATIONS_URL
  };

  const results = {};
  const promises = Object.entries(services).map(async ([name, url]) => {
    const sStart = Date.now();
    try {
      const resp = await axios.get(`${url}/health`, { timeout: 2000 });
      results[name] = { 
        status: resp.data.status || 'ok', 
        responseTime: Date.now() - sStart 
      };
    } catch (err) {
      results[name] = { 
        status: 'down', 
        responseTime: null, 
        error: err.code || err.message 
      };
    }
  });

  await Promise.allSettled(promises);

  const isDegraded = Object.values(results).some(s => s.status !== 'ok');
  const totalResponseTime = Date.now() - start;

  const health = {
    status: isDegraded ? 'degraded' : 'ok',
    gateway: 'ok',
    services: results,
    timestamp: new Date().toISOString(),
    totalResponseTime
  };

  res.status(isDegraded ? 503 : 200).json(health);
});

// Metrics Endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics(SERVICE_NAME));
});

// Proxy Helper
const proxy = (targetUrl) => async (req, res) => {
  const url = `${targetUrl}${req.path}`;
  try {
    const response = await withRetry(() => axios({
      method: req.method,
      url,
      data: req.body,
      params: req.query,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    }), {
      maxAttempts: 3,
      onRetry: (attempt, delay, error) => logger.warn(`Retrying ${url}`, { attempt, delay, error: error.message })
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      logger.error(`Proxy error to ${url}`, { error: err.message });
      res.status(502).json({ error: 'Bad Gateway', message: err.message });
    }
  }
};

// Catalogue Proxy
app.all('/products*', proxy(CATALOGUE_URL));

// Panier Proxy
app.all('/cart*', proxy(PANIER_URL));

// Commandes Proxy
app.all('/orders*', proxy(COMMANDES_URL));

// Notifications Proxy
app.all('/notifications*', proxy(NOTIFICATIONS_URL));

// Error handling
app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'Not Found',
    message: `La route ${req.method} ${req.path} n'existe pas`,
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({
    error: 'Internal Server Error',
    message: "Une erreur inattendue s'est produite",
    requestId: Date.now().toString(),
  });
});

const server = app.listen(PORT, () => {
  logger.info('Gateway started', { port: PORT });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed — all connections drained');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});
