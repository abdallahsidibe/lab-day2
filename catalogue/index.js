const express = require('express');
const logger = require('./logger');
const { metricsMiddleware, generateMetrics } = require('./metrics');
const { validateProduct } = require('./validators');

const app = express();
const PORT = process.env.PORT || 3001;
const SERVICE_NAME = process.env.SERVICE_NAME || 'catalogue';

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

let products = [
  { id: 1, name: "Laptop Pro 15",       price: 1299.99, stock: 10, reservedStock: 0, category: "electronics",  description: "Ordinateur portable haute performance", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, name: "Clavier Mécanique",   price: 89.99,  stock: 50, reservedStock: 0, category: "accessories",  description: "Clavier mécanique RGB", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, name: 'Écran 4K 27"',       price: 449.99, stock: 15, reservedStock: 0, category: "electronics",  description: "Écran 4K 27 pouces", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, name: "Souris Ergonomique",  price: 59.99,  stock: 80, reservedStock: 0, category: "accessories",  description: "Souris ergonomique sans fil", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 5, name: "Webcam HD",           price: 79.99,  stock: 0,  reservedStock: 0, category: "electronics",  description: "Webcam 1080p", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 6, name: "Hub USB-C 7 ports",   price: 49.99,  stock: 30, reservedStock: 0, category: "accessories",  description: "Hub USB-C multiport", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
];
let nextId = 7;

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
        records: products.length
      }
    }
  });
});

// Metrics Endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics(SERVICE_NAME, {
    records_total: products.length
  }));
});

// Catalogue Routes
app.get('/products', (req, res) => {
  res.json(products);
});

app.get('/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    logger.warn('Product not found', { id: req.params.id });
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

app.post('/products', (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length > 0) {
    logger.warn('Validation failed', { errors });
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const newProduct = {
    id: nextId++,
    name: req.body.name,
    description: req.body.description || "",
    price: req.body.price,
    stock: req.body.stock || 0,
    reservedStock: 0,
    category: req.body.category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  products.push(newProduct);
  logger.info('Product created', { id: newProduct.id });
  res.status(201).json(newProduct);
});

app.patch('/products/:id', (req, res) => {
  const index = products.findIndex(p => p.id === parseInt(req.params.id));
  if (index === -1) {
    logger.warn('Product not found', { id: req.params.id });
    return res.status(404).json({ error: 'Product not found' });
  }

  const product = products[index];
  const updates = req.body;
  
  // Validation for partial updates
  const tempProduct = { ...product, ...updates };
  const errors = validateProduct(tempProduct);
  if (errors.length > 0) {
    logger.warn('Validation failed', { errors });
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  products[index] = {
    ...product,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  res.json(products[index]);
});

app.delete('/products/:id', (req, res) => {
  const index = products.findIndex(p => p.id === parseInt(req.params.id));
  if (index === -1) {
    logger.warn('Product not found', { id: req.params.id });
    return res.status(404).json({ error: 'Product not found' });
  }

  products.splice(index, 1);
  res.status(204).send();
});

app.post('/products/:id/reserve', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    logger.warn('Product not found', { id: req.params.id });
    return res.status(404).json({ error: 'Product not found' });
  }

  const quantity = req.body.quantity;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const available = product.stock - product.reservedStock;
  if (available < quantity) {
    return res.status(409).json({ error: `Insufficient stock: requested ${quantity}, available ${available}` });
  }

  product.reservedStock += quantity;
  product.updatedAt = new Date().toISOString();
  res.json(product);
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
