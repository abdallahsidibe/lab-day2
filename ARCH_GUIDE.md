#  Guide d'Architecture Interne

## 1. Stratégie de Résilience (Communication Inter-services)
Nous utilisons le pattern **Retry with Jitter** pour tous les appels `Gateway -> Services` et `Orders -> Notifications`.

```text
Tentative 1 ---(Error)--> Delay 200ms + Jitter
Tentative 2 ---(Error)--> Delay 400ms + Jitter
Tentative 3 ---(Error)--> Fail (Propagate to Client)
```

## 2. Observabilité "Zéro-Lib"
Chaque service possède un `metricsMiddleware` (`metrics.js`) qui intercepte l'événement `res.on('finish')`.
- **Latency tracking** : Les 200 dernières durées sont conservées en mémoire pour calculer une moyenne glissante.
- **Counter** : Incrémenté par tuple `{Method, Path, Status}`.

### Référentiel des Métriques

Tous les services exposent les métriques suivantes via `/metrics` :

| Nom de la Métrique | Type | Labels | Description |
| :--- | :--- | :--- | :--- |
| `http_requests_total` | Counter | `method`, `path`, `status` | Nombre total de requêtes HTTP traitées. |
| `http_request_duration_seconds_avg` | Gauge | Aucun | Temps de réponse moyen (moyenne glissante). |
| `service_uptime_seconds` | Counter | Aucun | Temps écoulé depuis le démarrage du service. |
| `service_memory_usage_bytes` | Gauge | Aucun | Consommation mémoire actuelle (RSS). |

**Métriques métier spécifiques :**
- `order_creation_total` : Nombre de commandes créées (Service Commandes).
- `cart_items_added_total` : Nombre d'articles ajoutés aux paniers (Service Panier).
- `product_stock_low` : Flag (0 ou 1) indiquant un stock critique (Service Catalogue).

### Exemples de métriques personnalisées
Nous avons implémenté des compteurs spécifiques pour suivre l'activité métier.

**Commandes :**
![Métriques Commandes](images/exempledemetricpersopourlacommande.png)

**Panier :**
![Métriques Panier](images/exempledemetricpersopourlepanieronacheckpanier_request_total.png)

## 3. Rate Limiting (Protection)
Implémenté dans la Gateway (`rate-limiter.js`).
- **Store** : Objet JS clé/valeur `{ "IP": {count, resetAt} }`.
- **Headers** : Injecte `X-RateLimit-Remaining` dans chaque réponse pour informer le client.
- **Sécurité** : Si la Gateway est redémarrée, les compteurs sont remis à zéro (stateless).

## 4. Gestion des Erreurs Globale
Chaque service possède deux middlewares finaux :
1. **404 Handler** : Capture toutes les routes non définies.
2. **500 Handler** : `try/catch` global qui formate les erreurs JS inattendues en JSON propre avec un `requestId`.

## 5. Graceful Shutdown
À la réception du signal `SIGTERM` (Docker stop), le service :
1. Arrête d'accepter de nouvelles connexions.
2. Attend que les requêtes en cours soient terminées (timeout 10s).
3. Ferme le processus avec le code `0`.
