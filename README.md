# TP Jour 2 — Full Autonomie : Plateforme E-Commerce Observable
### Durée : 7 heures | Équipes de 2-3 | Aucune IA externe autorisée

> **Règle absolue :** ChatGPT, Copilot, Gemini, Claude et tout outil d'IA générative sont **interdits**. Votre seul droit de recours : la documentation officielle, Stack Overflow (lecture seule), vos notes de cours J1, et vos coéquipiers. Les commits sont horodatés et analysés.

---

## ⏱️ Planning de la journée

| Heure | Phase | Livrable intermédiaire vérifié par le formateur |
|-------|-------|--------------------------------------------|
| 08h30 | Kickoff + lecture du sujet | — |
| 09h00 | **Phase 1** — Architecture & conception | Schéma papier validé avant de coder |
| 10h00 | **Phase 2** — Développement des 5 services | Services démarrables individuellement |
| 12h00 | **Phase 3** — Communication inter-services | 2 services qui se parlent en live |
| 12h30 | 🍕 Pause déjeuner | — |
| 13h30 | **Phase 4** — Observabilité complète | /health + /metrics + logs JSON sur tous |
| 15h00 | **Phase 5** — Résilience & sécurité | Retry, timeout, validation, rate limiting |
| 16h00 | **Phase 6** — Tests, documentation & rapport | test.sh + README + rapport.md |
| **17h00** | **🏁 Rendu Git + présentation 5 min/équipe** | — |

---

## 🏗️ Phase 1 — Architecture & Conception (09h00 → 10h00)

### 1.1 Contexte

Vous êtes une startup qui lance une plateforme e-commerce. Le CTO impose une architecture microservices pour scaler chaque composant indépendamment. Aucun service ne partage de base de données (chacun a ses propres données en mémoire).

### 1.2 Architecture cible

```
                    [Client HTTP / Scripts de test]
                               |
                    ┌──────────▼──────────┐
                    │    API GATEWAY       │  :3000
                    │  (point d'entrée     │
                    │   unique, proxy,     │
                    │   rate limiting)     │
                    └──┬───────┬───────┬──┘
                       │       │       │        │
             ┌─────────▼─-┐  ┌──▼────┐ ┌▼────────────┐ ┌─────────────┐
             │ CATALOGUE  │  │PANIER │ │  COMMANDES  │ │NOTIFICATIONS│
             │   :3001    │  │ :3002 │ │    :3003    │ │   :3004     │
             └────────────┘  └───────┘ └──────┬──────┘ └──────▲──────┘
                                              │                │
                                              └────────────────┘
                                          (appel direct lors d'une commande)
```

### 1.3 Exercice de conception obligatoire (fait sur papier, validé par le formateur)

**Avant d'écrire une seule ligne de code**, réalisez sur papier ou whiteboard :

**A. Diagramme de séquence** du scénario suivant (identifiez chaque flèche = un appel HTTP) :
1. Un utilisateur consulte le catalogue et trouve un produit
2. Il l'ajoute à son panier
3. Il passe une commande
4. Il reçoit une confirmation

**B. Liste complète des routes** de chaque service :
Pour chaque route : méthode HTTP, chemin, description en une phrase, code HTTP de succès, code HTTP d'erreur possible.

**C. Modèles de données** :
Pour chaque service, listez les champs de chaque objet JSON manipulé (nom, type, obligatoire/optionnel, valeur par défaut).

**D. Cas d'erreur** :
- Que se passe-t-il si le service Notifications est down quand une commande est passée ?
- Que se passe-t-il si on essaie de commander un produit en rupture de stock ?
- Que se passe-t-il si le service Catalogue est down quand le Gateway reçoit un GET /products ?

**→ Faites valider ce schéma par le formateuresseur avant de commencer à coder. Aucune exception.**

---

## 📋 Phase 2 — Spécifications complètes des services (10h00 → 12h00)

### Service 1 — Catalogue (port 3001)

**Responsabilité :** Gérer le catalogue de produits. Source de vérité sur les stocks et les prix. Aucun autre service ne stocke les données produits.

#### Routes obligatoires

```
GET    /health                → état du service (format strict — voir Phase 4)
GET    /metrics               → métriques Prometheus texte (format strict — voir Phase 4)
GET    /products              → liste tous les produits
GET    /products/:id          → détail d'un produit (404 si inexistant)
POST   /products              → créer un produit (validation obligatoire)
PATCH  /products/:id          → modifier un produit (prix, stock, nom — partiel OK)
DELETE /products/:id          → supprimer un produit
POST   /products/:id/reserve  → réserver N unités de stock
```

#### Modèle de données exact

```json
{
  "id": 1,
  "name": "Laptop Pro 15",
  "description": "Ordinateur portable haute performance",
  "price": 1299.99,
  "stock": 10,
  "reservedStock": 2,
  "category": "electronics",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

#### Données initiales à pré-charger

```javascript
const products = [
  { id: 1, name: "Laptop Pro 15",       price: 1299.99, stock: 10, reservedStock: 0, category: "electronics",  description: "Ordinateur portable haute performance" },
  { id: 2, name: "Clavier Mécanique",   price: 89.99,  stock: 50, reservedStock: 0, category: "accessories",  description: "Clavier mécanique RGB" },
  { id: 3, name: "Écran 4K 27\"",       price: 449.99, stock: 15, reservedStock: 0, category: "electronics",  description: "Écran 4K 27 pouces" },
  { id: 4, name: "Souris Ergonomique",  price: 59.99,  stock: 80, reservedStock: 0, category: "accessories",  description: "Souris ergonomique sans fil" },
  { id: 5, name: "Webcam HD",           price: 79.99,  stock: 0,  reservedStock: 0, category: "electronics",  description: "Webcam 1080p" },
  { id: 6, name: "Hub USB-C 7 ports",   price: 49.99,  stock: 30, reservedStock: 0, category: "accessories",  description: "Hub USB-C multiport" }
];
let nextId = 7;
```

#### Règles métier à implémenter

- `price` : nombre strictement positif (pas 0, pas négatif)
- `stock` : entier ≥ 0
- `name` : chaîne non vide, max 100 caractères
- `category` : doit appartenir à `['electronics', 'accessories', 'clothing', 'food', 'other']`
- `POST /products/:id/reserve` payload : `{ "quantity": N }`. Vérifie que `stock - reservedStock >= N`. Si insuffisant → `409 Conflict` avec message `"Insufficient stock: requested N, available X"`
- `DELETE /products/:id` : retourne `404` si l'id n'existe pas
- `PATCH /products/:id` : met à jour uniquement les champs fournis. Met à jour `updatedAt`.
- `updatedAt` est mis à jour à chaque modification

---

### Service 2 — Panier (port 3002)

**Responsabilité :** Gérer les paniers d'achat. Les paniers sont en mémoire (perdus au redémarrage, c'est normal pour ce TP).

#### Routes obligatoires

```
GET    /health                          → état du service
GET    /metrics                         → métriques Prometheus
GET    /cart/:userId                    → panier de l'utilisateur (créé si inexistant)
POST   /cart/:userId/items              → ajouter un article
PATCH  /cart/:userId/items/:itemId      → modifier la quantité d'un item
DELETE /cart/:userId/items/:itemId      → supprimer un item
DELETE /cart/:userId                    → vider le panier entier
GET    /cart/:userId/summary            → résumé calculé du panier
```

#### Modèle de données exact

```json
{
  "userId": "user-42",
  "items": [
    {
      "itemId": "1705312800000",
      "productId": 1,
      "productName": "Laptop Pro 15",
      "quantity": 2,
      "unitPrice": 1299.99,
      "subtotal": 2599.98
    }
  ],
  "total": 2599.98,
  "itemCount": 2,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

#### Format du résumé `GET /cart/:userId/summary`

```json
{
  "userId": "user-42",
  "itemCount": 3,
  "uniqueProducts": 2,
  "total": 2689.97,
  "isEmpty": false
}
```

#### Règles métier à implémenter

- Si le panier de `userId` n'existe pas → le créer automatiquement avec `items: []`
- `quantity` doit être un entier ≥ 1. Si `quantity = 0` sur PATCH → supprimer l'item
- Si le même `productId` est ajouté deux fois → **incrémenter la quantité** de l'item existant (pas de doublon)
- `itemId` est généré côté serveur : `Date.now().toString()`
- `subtotal` = `quantity × unitPrice` (calculé, pas stocké séparément)
- `total` = somme de tous les `subtotal` (calculé à la volée dans chaque réponse)
- `itemCount` = somme de toutes les `quantity` (pas le nombre d'items uniques)
- `DELETE /cart/:userId` → vide le panier mais ne supprime pas l'objet (renvoie le panier vide)
- `PATCH /cart/:userId/items/:itemId` → `404` si l'itemId n'existe pas

---

### Service 3 — Commandes (port 3003)

**Responsabilité :** Orchestrer la création et le suivi des commandes. Appelle Notifications lors des changements de statut.

#### Routes obligatoires

```
GET    /health                  → état du service
GET    /metrics                 → métriques Prometheus
POST   /orders                  → créer une commande
GET    /orders                  → lister toutes les commandes (?userId=X pour filtrer)
GET    /orders/:id              → détail d'une commande (404 si inexistante)
PATCH  /orders/:id/status       → changer le statut (transitions validées)
DELETE /orders/:id              → annuler (passe à "cancelled", ne supprime pas)
GET    /orders/stats            → statistiques globales
```

#### Modèle de données exact

```json
{
  "id": "order-1705312800000",
  "userId": "user-42",
  "items": [
    {
      "productId": 1,
      "productName": "Laptop Pro 15",
      "quantity": 2,
      "unitPrice": 1299.99,
      "subtotal": 2599.98
    }
  ],
  "total": 2599.98,
  "status": "pending",
  "statusHistory": [
    { "status": "pending", "timestamp": "2024-01-15T10:00:00.000Z" }
  ],
  "shippingAddress": "123 rue de la Paix, 75001 Paris",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

#### Payload de `POST /orders`

```json
{
  "userId": "user-42",
  "items": [
    { "productId": 1, "productName": "Laptop Pro 15", "quantity": 2, "unitPrice": 1299.99 }
  ],
  "shippingAddress": "123 rue de la Paix, 75001 Paris"
}
```

#### Workflow de création (à respecter dans l'ordre)

```
1. Valider les données : userId (non vide), items (tableau non vide),
   shippingAddress (non vide), chaque item a productId/quantity/unitPrice valides
2. Calculer le total : somme de (quantity × unitPrice) pour chaque item
3. Calculer le subtotal de chaque item
4. Générer un id : "order-" + Date.now()
5. Créer l'objet commande avec status="pending", statusHistory=[{status:"pending",timestamp:now}]
6. Tenter d'appeler POST http://notifications:3004/notify (avec try/catch)
   → Si succès : log "Notification sent"
   → Si échec  : log WARN "Notification service unavailable" — la commande est quand même créée
7. Retourner 201 Created avec la commande complète
```

#### Transitions de statut autorisées

```
pending     → confirmed  ✅
pending     → cancelled  ✅
confirmed   → shipped    ✅
confirmed   → cancelled  ✅
shipped     → delivered  ✅
shipped     → cancelled  ❌ (409 — commande déjà expédiée)
delivered   → *          ❌ (409 — commande terminée)
cancelled   → *          ❌ (409 — commande annulée)
```

Lors de chaque transition réussie → appeler Notifications avec le type correspondant.
Ajouter l'entrée dans `statusHistory`.

#### Statistiques `GET /orders/stats`

```json
{
  "total": 42,
  "byStatus": {
    "pending": 10,
    "confirmed": 15,
    "shipped": 12,
    "delivered": 5,
    "cancelled": 0
  },
  "totalRevenue": 58492.50,
  "averageOrderValue": 1392.68
}
```
`totalRevenue` = somme des totals de toutes les commandes avec status ≠ "cancelled".
`averageOrderValue` = totalRevenue / nombre de commandes non annulées (0 si aucune).

---

### Service 4 — Notifications (port 3004)

**Responsabilité :** Réceptionner et historiser les notifications. Simule l'envoi (log JSON, pas de vrai email).

#### Routes obligatoires

```
GET    /health                      → état du service
GET    /metrics                     → métriques Prometheus
POST   /notify                      → enregistrer et simuler l'envoi d'une notification
GET    /notifications               → historique (?userId=X, ?type=Y, ?limit=N, ?offset=N)
GET    /notifications/:id           → détail d'une notification (404 si inexistante)
GET    /notifications/stats         → statistiques par type et par statut
DELETE /notifications               → purger tout l'historique (admin)
```

#### Payload de `POST /notify`

```json
{
  "type": "order_created",
  "userId": "user-42",
  "orderId": "order-1705312800000",
  "metadata": {}
}
```

Le service génère lui-même le `subject` et le `message` à partir du `type`.

#### Modèle de données exact

```json
{
  "id": "notif-1705312800000",
  "type": "order_created",
  "userId": "user-42",
  "orderId": "order-1705312800000",
  "subject": "Votre commande a été reçue",
  "message": "Votre commande #order-1705312800000 a bien été enregistrée.",
  "channel": "email",
  "status": "sent",
  "sentAt": "2024-01-15T10:00:00.000Z",
  "metadata": {}
}
```

#### Templates de messages à implémenter

```javascript
const templates = {
  order_created:   { subject: "Votre commande a été reçue",       message: (d) => `Votre commande #${d.orderId} a bien été enregistrée.` },
  order_confirmed: { subject: "Commande confirmée",               message: (d) => `Votre commande #${d.orderId} est confirmée et en préparation.` },
  order_shipped:   { subject: "Votre commande est en route",      message: (d) => `Votre commande #${d.orderId} a été expédiée !` },
  order_delivered: { subject: "Commande livrée — Merci !",        message: (d) => `Votre commande #${d.orderId} a été livrée. Merci pour votre achat !` },
  order_cancelled: { subject: "Commande annulée",                 message: (d) => `Votre commande #${d.orderId} a été annulée.` },
  low_stock:       { subject: "Alerte stock faible",              message: (d) => `Alerte : le stock de ${d.productName} est faible (${d.stock} unités restantes).` },
};
```

Si `type` n'est pas dans cette liste → `400 Bad Request` avec `{ "error": "Unknown notification type", "validTypes": [...] }`.

Simuler l'envoi avec ce log exact :
```json
{"level":"info","service":"notifications","msg":"Email sent","type":"order_created","userId":"user-42","subject":"Votre commande a été reçue"}
```

#### Filtres de `GET /notifications`

- `?userId=user-42` → filtre par userId
- `?type=order_created` → filtre par type
- `?limit=10` → maximum N résultats (défaut : 50)
- `?offset=0` → pagination (défaut : 0)
- Les filtres sont combinables

#### Statistiques `GET /notifications/stats`

```json
{
  "total": 87,
  "byType": {
    "order_created": 30,
    "order_confirmed": 25,
    "order_shipped": 20,
    "order_delivered": 12
  },
  "byStatus": { "sent": 85, "failed": 2 },
  "recentActivity": {
    "last1h": 12,
    "last24h": 45
  }
}
```

`recentActivity` compte les notifications créées dans les dernières 1h et 24h.

---

### Service 5 — API Gateway (port 3000)

**Responsabilité :** Unique point d'entrée. Proxy les requêtes, health check agrégé, rate limiting.

#### Routes obligatoires

```
GET    /health                      → health check agrégé des 4 services
GET    /metrics                     → métriques du gateway

GET    /products                    → proxy → catalogue:3001/products
GET    /products/:id                → proxy → catalogue:3001/products/:id
POST   /products                    → proxy → catalogue:3001/products
PATCH  /products/:id                → proxy → catalogue:3001/products/:id
DELETE /products/:id                → proxy → catalogue:3001/products/:id

GET    /cart/:userId                → proxy → panier:3002/cart/:userId
POST   /cart/:userId/items          → proxy → panier:3002/cart/:userId/items
PATCH  /cart/:userId/items/:itemId  → proxy → panier:3002/cart/:userId/items/:itemId
DELETE /cart/:userId/items/:itemId  → proxy → panier:3002/cart/:userId/items/:itemId
DELETE /cart/:userId                → proxy → panier:3002/cart/:userId

POST   /orders                      → proxy → commandes:3003/orders
GET    /orders                      → proxy → commandes:3003/orders
GET    /orders/stats                → proxy → commandes:3003/orders/stats
GET    /orders/:id                  → proxy → commandes:3003/orders/:id
PATCH  /orders/:id/status           → proxy → commandes:3003/orders/:id/status
DELETE /orders/:id                  → proxy → commandes:3003/orders/:id

GET    /notifications               → proxy → notifications:3004/notifications
GET    /notifications/stats         → proxy → notifications:3004/notifications/stats
```

#### Health check agrégé — format exact

```json
{
  "status": "degraded",
  "gateway": "ok",
  "services": {
    "catalogue":     { "status": "ok",   "responseTime": 12 },
    "panier":        { "status": "ok",   "responseTime": 8  },
    "commandes":     { "status": "down", "responseTime": null, "error": "ECONNREFUSED" },
    "notifications": { "status": "ok",   "responseTime": 15 }
  },
  "timestamp": "2024-01-15T10:00:00.000Z",
  "totalResponseTime": 35
}
```

- Appels en parallèle avec `Promise.allSettled` (ne pas bloquer sur un service down)
- Timeout de 2000ms par appel
- `status: "ok"` si tous up, `"degraded"` si au moins un down
- HTTP 200 si ok, HTTP 503 si degraded
- `responseTime` mesuré avec `Date.now()` avant/après l'appel

#### Rate limiting — implémenté SANS librairie externe

```
- 100 requêtes par minute par IP
- Si dépassé → HTTP 429 Too Many Requests
- Headers de réponse : X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

Vous devez l'implémenter vous-mêmes. Point de départ :

```javascript
// rate-limiter.js — À compléter
const store = {}; // { "ip_address": { count: N, resetAt: timestamp } }
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const ip = req.ip || '0.0.0.0';
  const now = Date.now();

  // TODO : implémenter la logique
  // 1. Récupérer ou créer l'entrée pour cette IP
  // 2. Réinitialiser si la fenêtre est expirée
  // 3. Incrémenter le compteur
  // 4. Définir les headers X-RateLimit-*
  // 5. Retourner 429 si le seuil est dépassé, sinon appeler next()

  next();
}

// TODO : nettoyer le store périodiquement pour éviter les fuites mémoire
// setInterval(...)

module.exports = { rateLimiter };
```

---

## 🔍 Phase 3 — Observabilité complète (13h30 → 15h00)

Toutes les fonctionnalités d'observabilité sont à implémenter **sans librairie externe** (`prom-client`, `winston`, `morgan` sont interdits).

### 3.1 Endpoint `/health` — Format strict

```json
{
  "status": "ok",
  "service": "catalogue",
  "version": "1.0.0",
  "uptime": 3600.42,
  "timestamp": "2024-01-15T10:00:00.000Z",
  "checks": {
    "memory": {
      "status": "ok",
      "used_mb": 45.2,
      "threshold_mb": 400
    },
    "dataStore": {
      "status": "ok",
      "records": 6
    }
  }
}
```

- `status` passe à `"degraded"` si `used_mb > threshold_mb`
- `uptime` vient de `process.uptime()`
- `checks.memory.used_mb` : `Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100`
- `checks.dataStore.records` : longueur de votre tableau de données

### 3.2 Endpoint `/metrics` — Format Prometheus exact, sans librairie

Chaque service expose au minimum ces métriques :

```
# HELP catalogue_requests_total Total number of HTTP requests
# TYPE catalogue_requests_total counter
catalogue_requests_total{method="GET",path="/products",status="200"} 42
catalogue_requests_total{method="POST",path="/products",status="201"} 5
catalogue_requests_total{method="GET",path="/products/:id",status="404"} 2

# HELP catalogue_request_duration_ms Average request duration in milliseconds
# TYPE catalogue_request_duration_ms gauge
catalogue_request_duration_ms{path="/products"} 12.40
catalogue_request_duration_ms{path="/products/:id"} 8.20

# HELP catalogue_uptime_seconds Service uptime in seconds
# TYPE catalogue_uptime_seconds counter
catalogue_uptime_seconds 3600

# HELP catalogue_memory_bytes Resident memory in bytes
# TYPE catalogue_memory_bytes gauge
catalogue_memory_bytes 47382528

# HELP catalogue_records_total Number of records in data store
# TYPE catalogue_records_total gauge
catalogue_records_total 6
```

Implémentez le tracking des métriques avec ce middleware :

```javascript
// metrics.js — À implémenter dans chaque service
const metrics = {
  requests: {},   // clé: "METHOD:path:STATUS" → valeur: count
  durations: {},  // clé: path → valeur: [durée1, durée2, ...]
};

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics' || req.path === '/health') return next();
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Normaliser le path pour regrouper /products/1 et /products/2 sous /products/:id
    const normalizedPath = req.path.replace(/\/\d+/g, '/:id');
    const key = `${req.method}:${normalizedPath}:${res.statusCode}`;

    metrics.requests[key] = (metrics.requests[key] || 0) + 1;

    if (!metrics.durations[normalizedPath]) metrics.durations[normalizedPath] = [];
    metrics.durations[normalizedPath].push(duration);
    // Fenêtre glissante : garder seulement les 200 dernières mesures
    if (metrics.durations[normalizedPath].length > 200) {
      metrics.durations[normalizedPath].shift();
    }
  });

  next();
}

function generateMetrics(serviceName, extraGauges = {}) {
  let out = '';

  out += `# HELP ${serviceName}_requests_total Total HTTP requests\n`;
  out += `# TYPE ${serviceName}_requests_total counter\n`;
  for (const [key, count] of Object.entries(metrics.requests)) {
    const [method, path, status] = key.split(':');
    out += `${serviceName}_requests_total{method="${method}",path="${path}",status="${status}"} ${count}\n`;
  }

  out += `# HELP ${serviceName}_request_duration_ms Avg duration ms\n`;
  out += `# TYPE ${serviceName}_request_duration_ms gauge\n`;
  for (const [path, durations] of Object.entries(metrics.durations)) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    out += `${serviceName}_request_duration_ms{path="${path}"} ${avg.toFixed(2)}\n`;
  }

  out += `# HELP ${serviceName}_uptime_seconds Uptime in seconds\n`;
  out += `# TYPE ${serviceName}_uptime_seconds counter\n`;
  out += `${serviceName}_uptime_seconds ${Math.floor(process.uptime())}\n`;

  const mem = process.memoryUsage();
  out += `# HELP ${serviceName}_memory_bytes RSS memory in bytes\n`;
  out += `# TYPE ${serviceName}_memory_bytes gauge\n`;
  out += `${serviceName}_memory_bytes ${mem.rss}\n`;

  for (const [name, value] of Object.entries(extraGauges)) {
    out += `# HELP ${serviceName}_${name}\n`;
    out += `# TYPE ${serviceName}_${name} gauge\n`;
    out += `${serviceName}_${name} ${value}\n`;
  }

  return out;
}

module.exports = { metricsMiddleware, generateMetrics };
```

Usage dans le service Catalogue :

```javascript
const { metricsMiddleware, generateMetrics } = require('./metrics');
app.use(metricsMiddleware);

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('catalogue', {
    records_total: products.length
  }));
});
```

### 3.3 Logger JSON — Sans librairie externe

Implémentez `logger.js` dans chaque service :

```javascript
// logger.js — À implémenter
const SERVICE_NAME = process.env.SERVICE_NAME || 'unknown';

const logger = {
  _write(level, msg, extra = {}) {
    const entry = {
      level,
      service: SERVICE_NAME,
      msg,
      timestamp: new Date().toISOString(),
      ...extra
    };
    // Tous les logs sur stdout (pas stderr sauf erreurs fatales)
    if (level === 'error') {
      process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  },
  debug: (msg, extra) => logger._write('debug', msg, extra),
  info:  (msg, extra) => logger._write('info',  msg, extra),
  warn:  (msg, extra) => logger._write('warn',  msg, extra),
  error: (msg, extra) => logger._write('error', msg, extra),
};

module.exports = logger;
```

**Logs obligatoires à implémenter** dans chaque service :

| Événement | Level | Champs supplémentaires |
|-----------|-------|------------------------|
| Démarrage du service | info | `port` |
| Requête reçue | info | `method`, `path`, `status`, `duration_ms` |
| Ressource créée | info | id de la ressource |
| Ressource introuvable | warn | id recherché |
| Validation échouée | warn | `errors` (tableau) |
| Erreur appel service externe | error | `service`, `url`, `error` |
| Arrêt propre (SIGTERM) | info | — |

Middleware de logging des requêtes à brancher sur `app.use()` :

```javascript
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
```

---

## 🛡️ Phase 4 — Résilience & Sécurité (15h00 → 16h00)

### 4.1 Validation des inputs — Sans librairie (pas de Joi, Zod, Yup)

Créez `validators.js` dans chaque service :

```javascript
// validators.js — exemple pour le service Catalogue
function validateProduct(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('name: requis, doit être une chaîne non vide');
  }
  if (body.name && body.name.length > 100) {
    errors.push('name: 100 caractères maximum');
  }
  if (body.price === undefined || body.price === null) {
    errors.push('price: requis');
  } else if (typeof body.price !== 'number' || isNaN(body.price) || body.price <= 0) {
    errors.push('price: doit être un nombre strictement positif');
  }
  if (body.stock !== undefined) {
    if (!Number.isInteger(body.stock) || body.stock < 0) {
      errors.push('stock: doit être un entier non négatif');
    }
  }
  const validCategories = ['electronics', 'accessories', 'clothing', 'food', 'other'];
  if (body.category !== undefined && !validCategories.includes(body.category)) {
    errors.push(`category: doit être l'une de ces valeurs : ${validCategories.join(', ')}`);
  }
  return errors; // tableau vide = valide
}

function validateOrder(body) {
  const errors = [];
  if (!body.userId || typeof body.userId !== 'string' || body.userId.trim() === '') {
    errors.push('userId: requis, doit être une chaîne non vide');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items: requis, doit être un tableau non vide');
  } else {
    body.items.forEach((item, i) => {
      if (!item.productId || typeof item.productId !== 'number') {
        errors.push(`items[${i}].productId: requis, doit être un nombre`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(`items[${i}].quantity: doit être un entier ≥ 1`);
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
        errors.push(`items[${i}].unitPrice: doit être un nombre positif`);
      }
    });
  }
  if (!body.shippingAddress || typeof body.shippingAddress !== 'string' || body.shippingAddress.trim() === '') {
    errors.push('shippingAddress: requis, doit être une chaîne non vide');
  }
  return errors;
}

module.exports = { validateProduct, validateOrder };
```

Format de réponse d'erreur de validation (obligatoire) :
```json
{
  "error": "Validation failed",
  "details": [
    "price: doit être un nombre strictement positif",
    "category: doit être l'une de ces valeurs : electronics, accessories, clothing, food, other"
  ]
}
```

### 4.2 Retry avec backoff exponentiel — Sans librairie (pas de axios-retry)

Implémentez `retry.js` dans le Gateway et le service Commandes :

```javascript
// retry.js — À compléter
async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Ne pas retenter si c'est une erreur client (4xx)
      if (err.response && err.response.status >= 400 && err.response.status < 500) {
        throw err;
      }

      if (attempt === maxAttempts) break;

      // Backoff exponentiel avec jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * exponentialDelay * 0.3;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      if (onRetry) onRetry(attempt, delay, err.message);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

module.exports = { withRetry };

// Exemple d'usage dans le Gateway :
// const data = await withRetry(
//   () => axios.get('http://catalogue:3001/products', { timeout: 2000 }),
//   {
//     maxAttempts: 3,
//     baseDelayMs: 200,
//     onRetry: (attempt, delay, error) =>
//       logger.warn('Retrying catalogue', { attempt, delay_ms: Math.round(delay), error })
//   }
// );
```

### 4.3 Gestion globale des erreurs — Obligatoire dans chaque service

Ces deux middlewares doivent être les **derniers** déclarés dans chaque service :

```javascript
// Middleware 404 — route introuvable
app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'Not Found',
    message: `La route ${req.method} ${req.path} n'existe pas`,
  });
});

// Middleware 500 — erreur non gérée
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Une erreur inattendue s\'est produite',
    requestId: Date.now().toString(),
  });
});
```

### 4.4 Graceful shutdown — Obligatoire dans chaque service

```javascript
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
```

---

## 🐳 Docker & Orchestration

### Structure de fichiers attendue ou recommandé

```
votre-projet/
├── gateway/
│   ├── index.js
│   ├── rate-limiter.js
│   ├── retry.js
│   ├── logger.js
│   ├── metrics.js
│   ├── package.json
│   └── Dockerfile
├── catalogue/
│   ├── index.js
│   ├── validators.js
│   ├── logger.js
│   ├── metrics.js
│   ├── package.json
│   └── Dockerfile
├── panier/
│   ├── index.js
│   ├── validators.js
│   ├── logger.js
│   ├── metrics.js
│   ├── package.json
│   └── Dockerfile
├── commandes/
│   ├── index.js
│   ├── validators.js
│   ├── retry.js
│   ├── logger.js
│   ├── metrics.js
│   ├── package.json
│   └── Dockerfile
├── notifications/
│   ├── index.js
│   ├── logger.js
│   ├── metrics.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── test.sh
├── rapport.md
└── README.md
```

### Dockerfile multi-stage (obligatoire pour chaque service)

```dockerfile
# Étape build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install --production

# Étape finale
FROM node:18-alpine
RUN apk add --no-cache wget curl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# Signal SIGTERM correctement propagé par node
CMD ["node", "index.js"]
```

### .env.example (à inclure dans le dépôt)

```
SERVICE_NAME=gateway
PORT=3000
NODE_ENV=development
CATALOGUE_URL=http://catalogue:3001
PANIER_URL=http://panier:3002
COMMANDES_URL=http://commandes:3003
NOTIFICATIONS_URL=http://notifications:3004
```

---

## 🧪 Phase 5 — Tests d'intégration (16h00 → 17h00)

Rédigez `test.sh` qui teste automatiquement les scénarios suivants. Format : PASS ou FAIL pour chaque test.

```bash
#!/bin/bash
# test.sh — Lancez avec : chmod +x test.sh && ./test.sh
# Prérequis : docker-compose up --build (stack démarrée)

BASE="http://localhost:3000"
CAT="http://localhost:3001"
PAN="http://localhost:3002"
CMD="http://localhost:3003"
NOT="http://localhost:3004"

PASS=0; FAIL=0
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" == "$expected" ]; then
    echo -e "${GREEN}  PASS${NC} $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}  FAIL${NC} $desc — attendu: $expected, obtenu: $actual"
    FAIL=$((FAIL+1))
  fi
}

check_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}  PASS${NC} $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}  FAIL${NC} $desc — '$needle' absent de la réponse"
    FAIL=$((FAIL+1))
  fi
}

http() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
body() { curl -s "$@"; }

echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo -e "${YELLOW}   Tests d'intégration — E-Commerce TP2  ${NC}"
echo -e "${YELLOW}════════════════════════════════════════${NC}"

# ── 1. Health checks ─────────────────────────────────────────
echo -e "\n--- 1. Health checks ---"
check "GET /health gateway"       "200" $(http $BASE/health)
check "GET /health catalogue"     "200" $(http $CAT/health)
check "GET /health panier"        "200" $(http $PAN/health)
check "GET /health commandes"     "200" $(http $CMD/health)
check "GET /health notifications" "200" $(http $NOT/health)

GATEWAY_HEALTH=$(body $BASE/health)
check_contains "Gateway health agrégé contient 'services'" "services" "$GATEWAY_HEALTH"
check_contains "Gateway health contient 'catalogue'" "catalogue" "$GATEWAY_HEALTH"

# ── 2. Métriques ─────────────────────────────────────────────
echo -e "\n--- 2. Métriques Prometheus ---"
check "GET /metrics catalogue HTTP 200" "200" $(http $CAT/metrics)
METRICS=$(body $CAT/metrics)
check_contains "/metrics contient _requests_total" "catalogue_requests_total" "$METRICS"
check_contains "/metrics contient _memory_bytes"   "catalogue_memory_bytes"   "$METRICS"
check_contains "/metrics contient _uptime_seconds" "catalogue_uptime_seconds" "$METRICS"

# ── 3. Catalogue CRUD ─────────────────────────────────────────
echo -e "\n--- 3. Catalogue ---"
check "GET /products"           "200" $(http $BASE/products)
check "GET /products/1"         "200" $(http $BASE/products/1)
check "GET /products/9999 → 404" "404" $(http $BASE/products/9999)

check "POST /products valide → 201" "201" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"Produit Test","price":29.99,"stock":5,"category":"other"}')

check "POST /products prix négatif → 400" "400" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"Bad","price":-10,"stock":5,"category":"other"}')

check "POST /products catégorie invalide → 400" "400" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"Bad","price":10,"stock":5,"category":"INVALIDE"}')

check "POST /products name vide → 400" "400" \
  $(http -X POST $CAT/products -H "Content-Type: application/json" \
    -d '{"name":"","price":10,"stock":5,"category":"other"}')

PROD_RESP=$(body -X POST $CAT/products -H "Content-Type: application/json" \
  -d '{"name":"Produit Perishable","price":5.00,"stock":3,"category":"food"}')
check_contains "POST /products → réponse contient id" '"id"' "$PROD_RESP"

# ── 4. Panier ─────────────────────────────────────────────────
echo -e "\n--- 4. Panier ---"
USER="test-user-$$"
check "GET /cart/:userId crée panier vide" "200" $(http $BASE/cart/$USER)

check "POST /cart/:userId/items → 201" "201" \
  $(http -X POST $PAN/cart/$USER/items -H "Content-Type: application/json" \
    -d '{"productId":2,"quantity":3,"unitPrice":89.99,"productName":"Clavier"}')

CART=$(body $PAN/cart/$USER)
check_contains "Panier contient l'item ajouté (productId 2)" '"productId":2' "$CART"
check_contains "Panier contient itemCount" '"itemCount"' "$CART"

check "POST même productId → quantité incrémentée" "201" \
  $(http -X POST $PAN/cart/$USER/items -H "Content-Type: application/json" \
    -d '{"productId":2,"quantity":1,"unitPrice":89.99,"productName":"Clavier"}')

CART2=$(body $PAN/cart/$USER)
# Après 2 ajouts du même produit (3+1), itemCount doit être 4
check_contains "Même produit → quantité incrémentée (itemCount=4)" '"itemCount":4' "$CART2"

check "POST quantity invalide → 400" "400" \
  $(http -X POST $PAN/cart/$USER/items -H "Content-Type: application/json" \
    -d '{"productId":1,"quantity":-1,"unitPrice":10}')

SUMMARY=$(body $PAN/cart/$USER/summary)
check_contains "GET /cart/:userId/summary contient total" '"total"' "$SUMMARY"
check_contains "GET /summary contient isEmpty" '"isEmpty"' "$SUMMARY"

# ── 5. Commandes ─────────────────────────────────────────────
echo -e "\n--- 5. Commandes ---"

ORDER_RESP=$(body -X POST $CMD/orders \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER\",\"items\":[{\"productId\":2,\"productName\":\"Clavier\",\"quantity\":1,\"unitPrice\":89.99}],\"shippingAddress\":\"1 rue Test, 75001 Paris\"}")

check_contains "POST /orders → status=pending" '"status":"pending"' "$ORDER_RESP"
check_contains "POST /orders → contient id"    '"id":"order-'       "$ORDER_RESP"

ORDER_ID=$(echo $ORDER_RESP | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

check "GET /orders/:id" "200" $(http $CMD/orders/$ORDER_ID)
check "GET /orders" "200" $(http $CMD/orders)

check "PATCH status pending→confirmed" "200" \
  $(http -X PATCH $CMD/orders/$ORDER_ID/status -H "Content-Type: application/json" \
    -d '{"status":"confirmed"}')

check "PATCH status invalide → 400" "400" \
  $(http -X PATCH $CMD/orders/$ORDER_ID/status -H "Content-Type: application/json" \
    -d '{"status":"pending"}')

STATS=$(body $CMD/orders/stats)
check_contains "GET /orders/stats contient total"     '"total"'     "$STATS"
check_contains "GET /orders/stats contient byStatus"  '"byStatus"'  "$STATS"
check_contains "GET /orders/stats contient revenue"   '"totalRevenue"' "$STATS"

# ── 6. Notifications ─────────────────────────────────────────
echo -e "\n--- 6. Notifications ---"
check "GET /notifications" "200" $(http $NOT/notifications)

# Vérifier que la commande a bien envoyé une notification
NOTIFS=$(body $NOT/notifications?userId=$USER)
check_contains "Notification de commande reçue" '"type":"order_created"' "$NOTIFS"

check "POST /notify type invalide → 400" "400" \
  $(http -X POST $NOT/notify -H "Content-Type: application/json" \
    -d '{"type":"type_qui_nexiste_pas","userId":"test"}')

NOTIF_STATS=$(body $NOT/notifications/stats)
check_contains "GET /notifications/stats contient byType" '"byType"' "$NOTIF_STATS"

# ── 7. Rate Limiting ─────────────────────────────────────────
echo -e "\n--- 7. Rate Limiting ---"
HEADERS=$(curl -sI $BASE/products)
check_contains "Header X-RateLimit-Limit présent"     "X-RateLimit-Limit"     "$HEADERS"
check_contains "Header X-RateLimit-Remaining présent" "X-RateLimit-Remaining" "$HEADERS"
check_contains "Header X-RateLimit-Reset présent"     "X-RateLimit-Reset"     "$HEADERS"

# ── 8. Erreurs 404 et 500 ────────────────────────────────────
echo -e "\n--- 8. Gestion des erreurs ---"
check "Route inexistante → 404" "404" $(http $CAT/route-inconnue)
ERR404=$(body $CAT/route-inconnue)
check_contains "404 contient error" '"error"' "$ERR404"

# ── Résumé ────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo "  Total : $((PASS+FAIL)) tests | ${GREEN}$PASS PASS${NC} | ${RED}$FAIL FAIL${NC}"
echo -e "${YELLOW}════════════════════════════════════════${NC}"
[ $FAIL -eq 0 ] && echo -e "${GREEN}  ✔ Tous les tests passent !${NC}" && exit 0
echo -e "${RED}  ✘ $FAIL test(s) échoué(s)${NC}" && exit 1
```

---

## 📝 Phase 6 — Documentation (16h00 → 17h00)

### README.md — Sections obligatoires

1. **Membres de l'équipe** — noms et prénoms
2. **Architecture** — schéma ASCII de votre architecture finale
3. **Choix techniques** — 3 décisions techniques justifiées (pourquoi ce choix, quelle alternative rejetée)
4. **Lancer la stack** — commande unique, commande de nettoyage
5. **Tester chaque endpoint** — une commande `curl` par route principale avec exemple de réponse
6. **Difficultés rencontrées** — 3 à 5 problèmes réels + solutions appliquées (soyez précis)
7. **Améliorations futures** — ce que vous feriez avec 2 heures de plus

### rapport.md — Répondez à ces 5 questions (min. 1 page)

**Q1.** La méthodologie **12-factor app** définit 12 principes pour les applications cloud-native. Listez les 12 facteurs et indiquez pour chacun si vous le respectez dans ce TP, et pourquoi.

**Q2.** En Kubernetes, un Pod a deux types de health checks : `livenessProbe` et `readinessProbe`. Quelle est la différence ? Lequel correspond à votre endpoint `/health` actuel ? Comment adapteriez-vous votre code pour exposer les deux séparément ?

**Q3.** Expliquez pourquoi les logs doivent aller sur `stdout` et non dans des fichiers, dans un contexte de conteneurs Docker. Que se passe-t-il avec vos logs si vous faites `docker-compose down` ?

**Q4.** Votre rate limiting fonctionne parfaitement avec un seul container du gateway. Expliquez pourquoi ce même mécanisme **cesserait de fonctionner correctement** si vous passiez à 3 replicas du gateway en production. Quelle solution proposeriez-vous ?

**Q5.** Lors d'une commande, votre service Commandes appelle Notifications. Si Notifications est down, votre code gère l'erreur avec un try/catch (la commande est quand même créée). Décrivez deux approches alternatives qui garantiraient que la notification est envoyée **au moins une fois**, même si Notifications redémarre 10 minutes plus tard.

---

## 📋 Critères de notation

### Code (20 pts)

| Critère | Détail | Points |
|---------|--------|--------|
| Services démarrables | `docker-compose up --build` sans erreur, tous healthy | 3 pts |
| Routes complètes | Toutes les routes spécifiées, avec les bons codes HTTP | 4 pts |
| Règles métier | Validations, transitions de statut, calculs corrects | 3 pts |
| Observabilité | /health format strict, /metrics format Prometheus, logs JSON niveaux | 4 pts |
| Résilience | Rate limiting avec headers, retry backoff, gestion erreurs globale, graceful shutdown | 4 pts |
| Docker | Dockerfile multi-stage, health checks, variables d'env, .env.example | 2 pts |

### Tests automatisés (5 pts)

| Critère | Points |
|---------|--------|
| test.sh présent, exécutable, syntaxe correcte | 1 pt |
| Tests structurés avec PASS/FAIL | 2 pts |
| ≥ 75% des tests passent | 1 pt |
| 100% des tests passent | 1 pt |

### Documentation (5 pts)

| Critère | Points |
|---------|--------|
| README avec toutes les sections, commandes curl fonctionnelles | 2 pts |
| rapport.md avec les 5 questions développées | 3 pts |

### Bonus (jusqu'à +5 pts)

| Bonus | Points |
|-------|--------|
| `GET /orders/stats` avec revenue et average corrects | +1 pt |
| `POST /products/:id/reserve` avec gestion stock réservé | +1 pt |
| Nettoyage du rate-limit store sans fuite mémoire | +1 pt |
| `GET /notifications/stats` avec `recentActivity` correct | +1 pt |
| `test.sh` couvre le scénario complet de bout en bout (ajout panier → commande → notif vérifiée) | +1 pt |

---

## 📦 Livrable à 17h00 précises

1. **Dépôt Git** — URL partagée (public ou accès accordé)
2. **`docker-compose up --build`** — fonctionne en une commande
3. **`./test.sh`** — affiche les PASS/FAIL
4. Fichiers **`README.md`**, **`rapport.md`**, **`test.sh`** à la racine
5. **Présentation 5 minutes** :
   - `docker-compose up` en live
   - Lancement de `./test.sh`
   - Scénario complet curl : produit → panier → commande → notification
   - Lecture de `/metrics` d'un service et explication d'un compteur

---

## ⚠️ Règles strictes

- **Aucune IA externe** — ChatGPT, Copilot, Gemini, Claude.ai interdits
- **Librairies interdites pour l'observabilité/résilience** : `prom-client`, `winston`, `morgan`, `pino`, `bunyan`, `joi`, `zod`, `yup`, `express-rate-limit`, `axios-retry`, `opossum`, `cockatiel`
- **Librairies autorisées** : `express`, `axios`, `node-fetch`, `httpx` (Python), et les modules natifs Node.js/Python
- En cas de blocage > 15 minutes : appelez le formateur. Attendez une question, pas une réponse.
- Les commits Git sont horodatés. Un premier commit à 16h55 avec tout le code est un signal fort.