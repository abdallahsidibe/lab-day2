const express = require('express');
const axios = require('axios');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const { validateOrder } = require('./validators');
const { withRetry } = require('./retry');

const app = express();
const PORT = process.env.PORT || 3003;
const SERVICE_NAME = process.env.SERVICE_NAME || 'commandes';
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_URL || 'http://notifications:3004';

app.use(express.json());

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

const orders = [];

// Health Endpoint
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  const usedMB = Math.round(mem.rss / 1024 / 1024 * 100) / 100;
  const thresholdMB = 400;
  
  const status = usedMB > thresholdMB ? 'degraded' : 'ok';
  
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    service: SERVICE_NAME,
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      memory: {
        status: usedMB > thresholdMB ? 'warn' : 'ok',
        used_mb: usedMB,
        threshold_mb: thresholdMB
      },
      dataStore: {
        status: "ok",
        records: orders.length
      }
    }
  });
});

// Metrics Endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics(SERVICE_NAME, {
    records_total: orders.length
  }));
});

// Orders Routes
app.post('/orders', async (req, res) => {
  const errors = validateOrder(req.body);
  if (errors.length > 0) {
    logger.warn('Validation failed', { errors });
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { userId, items, shippingAddress } = req.body;
  
  const processedItems = items.map(item => ({
    ...item,
    subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100
  }));

  const total = processedItems.reduce((acc, item) => acc + item.subtotal, 0);
  const orderId = "order-" + Date.now();
  const now = new Date().toISOString();

  const newOrder = {
    id: orderId,
    userId,
    items: processedItems,
    total: Math.round(total * 100) / 100,
    status: "pending",
    statusHistory: [
      { status: "pending", timestamp: now }
    ],
    shippingAddress,
    createdAt: now,
    updatedAt: now
  };

  orders.push(newOrder);
  logger.info('Order created', { id: orderId });

  // Attempt to notify
  try {
    await withRetry(() => axios.post(`${NOTIFICATIONS_URL}/notify`, {
      type: "order_created",
      userId: userId,
      orderId: orderId,
      metadata: {}
    }, { timeout: 2000 }), {
      maxAttempts: 3,
      onRetry: (attempt, delay, error) => logger.warn('Retrying notification', { attempt, delay, error })
    });
    logger.info("Notification sent");
  } catch (err) {
    logger.warn("Notification service unavailable", { error: err.message });
  }

  res.status(201).json(newOrder);
});

app.get('/orders', (req, res) => {
  const { userId } = req.query;
  if (userId) {
    return res.json(orders.filter(o => o.userId === userId));
  }
  res.json(orders);
});

app.get('/orders/stats', (req, res) => {
  const stats = {
    total: orders.length,
    byStatus: {
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0
    },
    totalRevenue: 0,
    averageOrderValue: 0
  };

  let nonCancelledCount = 0;
  orders.forEach(order => {
    stats.byStatus[order.status]++;
    if (order.status !== 'cancelled') {
      stats.totalRevenue += order.total;
      nonCancelledCount++;
    }
  });

  stats.totalRevenue = Math.round(stats.totalRevenue * 100) / 100;
  if (nonCancelledCount > 0) {
    stats.averageOrderValue = Math.round((stats.totalRevenue / nonCancelledCount) * 100) / 100;
  }

  res.json(stats);
});

app.get('/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

app.patch('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  const order = orders.find(o => o.id === req.params.id);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['shipped', 'cancelled'],
    'shipped': ['delivered'],
    'delivered': [],
    'cancelled': []
  };

  if (!validTransitions[order.status].includes(status)) {
    return res.status(409).json({ error: `Invalid transition from ${order.status} to ${status}` });
  }

  const now = new Date().toISOString();
  order.status = status;
  order.statusHistory.push({ status, timestamp: now });
  order.updatedAt = now;

  // Notify of status change
  let notifType = `order_${status}`;
  try {
    await withRetry(() => axios.post(`${NOTIFICATIONS_URL}/notify`, {
      type: notifType,
      userId: order.userId,
      orderId: order.id,
      metadata: {}
    }, { timeout: 2000 }));
    logger.info("Notification sent");
  } catch (err) {
    logger.warn("Notification service unavailable", { error: err.message });
  }

  res.json(order);
});

app.delete('/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.status === 'delivered' || order.status === 'shipped') {
    return res.status(409).json({ error: `Cannot cancel order in ${order.status} status` });
  }

  if (order.status === 'cancelled') {
    return res.json(order);
  }

  const now = new Date().toISOString();
  order.status = 'cancelled';
  order.statusHistory.push({ status: 'cancelled', timestamp: now });
  order.updatedAt = now;

  res.json(order);
});

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
  logger.info('Service started', { port: PORT });
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
