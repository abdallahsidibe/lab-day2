#  Plateforme Microservices E-Commerce Observable

[![Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20Docker-blue.svg)](#)
[![Tests](https://img.shields.io/badge/Tests-46%2F46%20PASS-brightgreen.svg)](#)
[![License](https://img.shields.io/badge/Zero--Dependency-True-orange.svg)](#)

Ce projet est une implémentation de référence d'une architecture microservices hautement disponible, résiliente et observable, réalisée sans aucune librairie externe pour l'observabilité et la résilience.

---

##  Navigation Rapide
-  **[Spécifications API](API_SPEC.md)** : Détail des endpoints et contrats JSON.
-  **[Guide d'Architecture](ARCH_GUIDE.md)** : Fonctionnement interne (Retries, Rate Limit, Metrics).
-  **[Rapport Technique](rapport.md)** : Réponses aux questions théoriques (12-factor, K8s).
-  **[Dépannage](TROUBLESHOOTING.md)** : Solutions aux problèmes fréquents.

---

## 🏗 Architecture du Système
La plateforme est composée de 5 services isolés communiquant via un réseau virtuel Docker.

```mermaid
graph TD
    Client((💻 User/Test)) -->|HTTP :3005| Gateway[<b>API Gateway</b><br/><i>Entry Point</i>]
    
    subgraph "Internal Docker Network"
        Gateway -->|Routing| Catalogue[<b>Catalogue</b><br/><i>Products & Stock</i>]
        Gateway -->|Routing| Panier[<b>Panier</b><br/><i>User Carts</i>]
        Gateway -->|Routing| Commandes[<b>Commandes</b><br/><i>Checkout Logic</i>]
        
        Commandes -.->|Async Notify| Notifications[<b>Notifications</b><br/><i>Email Sim</i>]
    end
    
    %% Styling
    style Gateway fill:#f9f,stroke:#333,stroke-width:2px
    style Catalogue fill:#e1f5fe,stroke:#01579b
    style Panier fill:#e1f5fe,stroke:#01579b
    style Commandes fill:#e1f5fe,stroke:#01579b
    style Notifications fill:#f1f8e9,stroke:#33691e
```

### Flux de Requêtes
![Diagramme de Séquence](images/diagrammedesequence.png)

---

##  Démarrage Rapide

### 1. Prérequis
- Docker Desktop (macOS/Windows) ou Docker Engine (Linux).
- Port 3005 disponible.

### 2. Lancement
```bash
# Construction et démarrage de la stack
docker compose up --build -d

# Vérification de l'état
docker compose ps
```

![Démarrage Docker Compose](images/dockercomposeupbuild-d.png)

### 3. Validation Automatisée
Le projet inclut une suite de 46 tests d'intégration couvrant 100% des spécifications.
```bash
./test.sh
```

![Résultat des tests](images/tests_results.png)

---

##  Choix Techniques & Résilience

| Mécanisme | Implémentation | Bénéfice |
| :--- | :--- | :--- |
| **Observabilité** | `/metrics` Prometheus Text & Logs JSON | Zero-overhead, standard industriel. |
| **Rate Limiting** | Fenêtre glissante (60s) par IP | Protection contre les attaques DoS. |
| **Résilience** | Exponential Backoff + Jitter | Tolérance aux pannes transitoires. |
| **Santé** | Health checks agrégés & individuels | Monitoring proactif (Liveness/Readiness). |
| **Shutdown** | Gestion propre du signal `SIGTERM` | Aucune perte de données en cours. |

---

##  Configuration (Variables d'Environnement)
Le système est configurable via un fichier `.env`. Voici les variables principales :

| Variable | Description | Valeur par défaut |
| :--- | :--- | :--- |
| `NODE_ENV` | Mode d'exécution (development/production) | `development` |
| `GATEWAY_PORT` | Port exposé par la Gateway | `3005` |
| `CATALOGUE_URL` | URL interne pour le service Catalogue | `http://catalogue:3001` |
| `PANIER_URL` | URL interne pour le service Panier | `http://panier:3002` |
| `COMMANDES_URL` | URL interne pour le service Commandes | `http://commandes:3003` |
| `NOTIFICATIONS_URL` | URL interne pour le service Notifications | `http://notifications:3004` |

---

##  Scénario d'Utilisation Typique

Pour tester manuellement le flux complet, vous pouvez suivre ces étapes avec `curl` :

1. **Lister les produits** :
   ```bash
   curl http://localhost:3005/products
   ```
2. **Ajouter au panier** :
   ```bash
   curl -X POST http://localhost:3005/cart/user1/items \
     -H "Content-Type: application/json" \
     -d '{"productId": 1, "productName": "Laptop", "quantity": 1, "unitPrice": 999.99}'
   ```
3. **Passer la commande** :
   ```bash
   curl -X POST http://localhost:3005/orders \
     -H "Content-Type: application/json" \
     -d '{"userId": "user1", "items": [{"productId": 1, "quantity": 1}], "total": 999.99}'
   ```

---

##  Monitoring & Logs

### Consulter les Métriques
Chaque service expose des métriques en temps réel.
```bash
curl http://localhost:3001/metrics # Catalogue
curl http://localhost:3003/metrics # Commandes
```

![Métriques Prometheus Catalogue](images/metrics_prometheus_catalogue.png)

![Santé des services dans Prometheus](images/prometheus_services_health.png)

### Dashboard Grafana
Visualisation globale de l'état du système.

![Dashboard Grafana](images/dashboardgrafana.png)

### Visualiser les Logs
Les logs sont structurés en JSON pour faciliter l'indexation.
```bash
docker compose logs -f gateway
```

---
