# Plateforme E-Commerce Observable — TP Jour 2

## Membres de l'équipe
- Gemini CLI Agent (Réalisation autonome)

## Architecture
```
                    [Client HTTP / Scripts de test]
                               |
                    ┌──────────▼──────────┐
                    │    API GATEWAY       │  :3005 (Host) -> :3000 (Conteneur)
                    │  (point d'entrée     │
                    │   unique, proxy,     │
                    │   rate limiting)     │
                    └──┬───────┬───────┬──┘
                       │       │       │
             ┌─────────▼─┐  ┌──▼────┐ ┌▼────────────┐ ┌─────────────┐
             │ CATALOGUE │  │PANIER │ │  COMMANDES  │ │NOTIFICATIONS│
             │   :3001   │  │ :3002 │ │    :3003    │ │   :3004     │
             └───────────┘  └───────┘ └──────┬──────┘ └──────▲──────┘
                                             │                │
                                             └────────────────┘
```

## Choix techniques
1. **Architecture Microservices Orientée API** : Chaque service est indépendant, possède sa propre logique métier et expose des endpoints standardisés (`/health`, `/metrics`). Les services communiquent via HTTP/JSON.
2. **Observabilité Custom (Zéro Dépendance)** : L'instrumentation a été réalisée sans librairies tierces (pas de `prom-client`, `winston`, etc.). Les métriques sont générées au format texte brut compatible Prometheus, et les logs sont structurés en JSON sur `stdout`/`stderr`.
3. **Résilience et Sécurité Intégrées** : 
   - **Rate Limiting** : Implémenté dans la Gateway pour limiter à 100 requêtes/minute par IP.
   - **Retries avec Backoff** : Communication inter-services sécurisée par une logique de ré-essai avec délai exponentiel et jitter.
   - **Graceful Shutdown** : Gestion des signaux `SIGTERM` pour fermer les connexions proprement avant l'arrêt des conteneurs.

## Lancer la stack
```bash
# Lancement de tous les services en arrière-plan
docker compose up --build -d

# Vérifier que les conteneurs sont UP
docker compose ps

# Nettoyage complet (conteneurs et réseaux)
docker compose down -v
```

## Tester l'application
### Suite de tests automatisés
Un script complet valide l'intégralité des fonctionnalités et des contraintes (46 tests au total) :
```bash
chmod +x test.sh
./test.sh
```

### Exemples de commandes curl (via Gateway port 3005)
Voici quelques exemples pour tester manuellement :

#### 1. Catalogue
```bash
# Lister les produits
curl http://localhost:3005/products

# Détail d'un produit
curl http://localhost:3005/products/1
```

#### 2. Panier
```bash
# Ajouter au panier (userId: user1)
curl -X POST http://localhost:3005/cart/user1/items 
     -H "Content-Type: application/json" 
     -d '{"productId":1,"quantity":2,"unitPrice":1299.99,"productName":"Laptop Pro 15"}'

# Voir le résumé du panier
curl http://localhost:3005/cart/user1/summary
```

#### 3. Commandes
```bash
# Créer une commande
curl -X POST http://localhost:3005/orders 
     -H "Content-Type: application/json" 
     -d '{"userId":"user1","items":[{"productId":1,"quantity":1,"unitPrice":1299.99}],"shippingAddress":"Paris, France"}'
```

#### 4. Observabilité
```bash
# Health check agrégé (Gateway)
curl http://localhost:3005/health

# Métriques Prometheus (Catalogue)
curl http://localhost:3001/metrics
```

## Difficultés rencontrées
1. **Conflit de port sur macOS** : Le port 3000 étant souvent réservé (ex: Control Center ou Docker lui-même), la Gateway a été déplacée sur le port **3005** pour éviter les échecs de démarrage.
2. **Échappement des caractères spéciaux** : L'écriture de fichiers via des outils automatisés a parfois corrompu les caractères de retour à la ligne (`
`) ou les apostrophes dans les messages. Solution : Utilisation de `String.fromCharCode(10)` pour les sauts de ligne et de doubles quotes pour les messages d'erreur.
3. **Synchronisation du Rate Limit** : Le store du rate limiter étant en mémoire, il est réinitialisé à chaque redémarrage du conteneur. Pour une production réelle, Redis serait nécessaire.

## Améliorations futures
1. **Persistance des données** : Actuellement, tout est en mémoire (perdu au redémarrage). L'ajout de Redis (Panier) et PostgreSQL (Catalogue/Commandes) serait la prochaine étape.
2. **Traçage Distribué** : Implémenter la propagation d'un `X-Correlation-ID` pour suivre une requête à travers tous les microservices dans les logs.
3. **Déploiement Kubernetes** : Créer les manifests (Deployments, Services, ConfigMaps) pour orchestrer la stack de manière plus résiliente.
