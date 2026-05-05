const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || 'notifications';

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

const notifications = [];

const templates = {
  order_created:   { subject: "Votre commande a été reçue",       message: (d) => `Votre commande #${d.orderId} a bien été enregistrée.` },
  order_confirmed: { subject: "Commande confirmée",               message: (d) => `Votre commande #${d.orderId} est confirmée et en préparation.` },
  order_shipped:   { subject: "Votre commande est en route",      message: (d) => `Votre commande #${d.orderId} a été expédiée !` },
  order_delivered: { subject: "Commande livrée — Merci !",        message: (d) => `Votre commande #${d.orderId} a été livrée. Merci pour votre achat !` },
  order_cancelled: { subject: "Commande annulée",                 message: (d) => `Votre commande #${d.orderId} a été annulée.` },
  low_stock:       { subject: "Alerte stock faible",              message: (d) => `Alerte : le stock de ${d.productName} est faible (${d.stock} unités restantes).` },
};

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
        records: notifications.length
      }
    }
  });
});

// Metrics Endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics(SERVICE_NAME, {
    records_total: notifications.length
  }));
});

// Notifications Routes
app.post('/notify', (req, res) => {
  const { type, userId, orderId, metadata } = req.body;

  if (!templates[type]) {
    return res.status(400).json({ 
      error: "Unknown notification type", 
      validTypes: Object.keys(templates) 
    });
  }

  const template = templates[type];
  const subject = template.subject;
  const message = template.message(req.body);
  const now = new Date().toISOString();

  const newNotif = {
    id: "notif-" + Date.now(),
    type,
    userId,
    orderId,
    subject,
    message,
    channel: "email",
    status: "sent",
    sentAt: now,
    metadata: metadata || {}
  };

  notifications.push(newNotif);

  // Exact log format required by specs
  logger.info("Email sent", {
    level: "info",
    service: SERVICE_NAME,
    msg: "Email sent",
    type: type,
    userId: userId,
    subject: subject
  });

  res.status(201).json(newNotif);
});

app.get('/notifications', (req, res) => {
  let { userId, type, limit = 50, offset = 0 } = req.query;
  limit = parseInt(limit);
  offset = parseInt(offset);

  let filtered = notifications;
  if (userId) filtered = filtered.filter(n => n.userId === userId);
  if (type) filtered = filtered.filter(n => n.type === type);

  res.json(filtered.slice(offset, offset + limit));
});

app.get('/notifications/stats', (req, res) => {
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;
  const twentyFourHoursAgo = now - 24 * 3600 * 1000;

  const stats = {
    total: notifications.length,
    byType: {},
    byStatus: { sent: 0, failed: 0 },
    recentActivity: {
      last1h: 0,
      last24h: 0
    }
  };

  notifications.forEach(n => {
    stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
    stats.byStatus[n.status]++;
    
    const sentAt = new Date(n.sentAt).getTime();
    if (sentAt > oneHourAgo) stats.recentActivity.last1h++;
    if (sentAt > twentyFourHoursAgo) stats.recentActivity.last24h++;
  });

  res.json(stats);
});

app.get('/notifications/:id', (req, res) => {
  const notif = notifications.find(n => n.id === req.params.id);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });
  res.json(notif);
});

app.delete('/notifications', (req, res) => {
  notifications.length = 0;
  res.status(204).send();
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
