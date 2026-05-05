const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3002;
const SERVICE_NAME = process.env.SERVICE_NAME || 'panier';

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

const carts = {}; // userId -> cart object

const createEmptyCart = (userId) => ({
  userId,
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const calculateCartStats = (cart) => {
  let total = 0;
  let itemCount = 0;
  cart.items.forEach(item => {
    item.subtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
    total += item.subtotal;
    itemCount += item.quantity;
  });
  cart.total = Math.round(total * 100) / 100;
  cart.itemCount = itemCount;
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
        records: Object.keys(carts).length
      }
    }
  });
});

// Metrics Endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics(SERVICE_NAME, {
    records_total: Object.keys(carts).length
  }));
});

// Panier Routes
app.get('/cart/:userId', (req, res) => {
  const { userId } = req.params;
  if (!carts[userId]) {
    carts[userId] = createEmptyCart(userId);
  }
  const cart = carts[userId];
  calculateCartStats(cart);
  res.json(cart);
});

app.post('/cart/:userId/items', (req, res) => {
  const { userId } = req.params;
  const { productId, productName, quantity, unitPrice } = req.body;

  if (!productId || !quantity || quantity < 1 || !unitPrice) {
    return res.status(400).json({ error: 'Missing or invalid fields (productId, quantity >= 1, unitPrice are required)' });
  }

  if (!carts[userId]) {
    carts[userId] = createEmptyCart(userId);
  }

  const cart = carts[userId];
  const existingItem = cart.items.find(item => item.productId === productId);

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.unitPrice = unitPrice; // Update price just in case
  } else {
    cart.items.push({
      itemId: Date.now().toString(),
      productId,
      productName: productName || "Unknown Product",
      quantity,
      unitPrice
    });
  }

  cart.updatedAt = new Date().toISOString();
  calculateCartStats(cart);
  res.status(201).json(cart);
});

app.patch('/cart/:userId/items/:itemId', (req, res) => {
  const { userId, itemId } = req.params;
  const { quantity } = req.body;

  if (quantity === undefined || !Number.isInteger(quantity)) {
    return res.status(400).json({ error: 'Quantity must be an integer' });
  }

  if (!carts[userId]) {
    return res.status(404).json({ error: 'Cart not found' });
  }

  const cart = carts[userId];
  const itemIndex = cart.items.findIndex(item => item.itemId === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  if (quantity <= 0) {
    cart.items.splice(itemIndex, 1);
  } else {
    cart.items[itemIndex].quantity = quantity;
  }

  cart.updatedAt = new Date().toISOString();
  calculateCartStats(cart);
  res.json(cart);
});

app.delete('/cart/:userId/items/:itemId', (req, res) => {
  const { userId, itemId } = req.params;

  if (!carts[userId]) {
    return res.status(404).json({ error: 'Cart not found' });
  }

  const cart = carts[userId];
  const itemIndex = cart.items.findIndex(item => item.itemId === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  cart.items.splice(itemIndex, 1);
  cart.updatedAt = new Date().toISOString();
  calculateCartStats(cart);
  res.json(cart);
});

app.delete('/cart/:userId', (req, res) => {
  const { userId } = req.params;
  if (!carts[userId]) {
    carts[userId] = createEmptyCart(userId);
  } else {
    carts[userId].items = [];
    carts[userId].updatedAt = new Date().toISOString();
  }
  calculateCartStats(carts[userId]);
  res.json(carts[userId]);
});

app.get('/cart/:userId/summary', (req, res) => {
  const { userId } = req.params;
  if (!carts[userId]) {
    carts[userId] = createEmptyCart(userId);
  }
  const cart = carts[userId];
  calculateCartStats(cart);

  const summary = {
    userId: cart.userId,
    itemCount: cart.itemCount,
    uniqueProducts: cart.items.length,
    total: cart.total,
    isEmpty: cart.items.length === 0
  };
  res.json(summary);
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
