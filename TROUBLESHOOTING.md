# 🆘 Guide de Dépannage (Troubleshooting)

Ce document liste les problèmes courants rencontrés lors du développement ou du déploiement de la plateforme et leurs solutions.

## 1. Problèmes Docker

### Les conteneurs ne démarrent pas
**Symptôme** : `docker compose up` affiche des erreurs de port déjà utilisé.
**Solution** :
- Vérifiez si un autre service utilise le port 3005 (Gateway) ou les ports 3000-3004.
- Utilisez `lsof -i :3005` pour identifier le processus.
- Ou changez le port dans le fichier `.env` et le `docker-compose.yml`.

### Changements de code non pris en compte
**Symptôme** : Vous modifiez un fichier JS mais le comportement reste l'ancien.
**Solution** :
- Docker met en cache les couches de build. Forcez la reconstruction :
  ```bash
  docker compose build --no-cache
  docker compose up -d
  ```

## 2. Problèmes Réseau (Communication Inter-services)

### Timeout ou Connection Refused
**Symptôme** : La Gateway retourne une erreur 503 ou 504.
**Solution** :
- Vérifiez que tous les services sont "Up" avec `docker compose ps`.
- Vérifiez les URLs dans les variables d'environnement. Dans Docker, les services doivent s'appeler par leur nom de service (ex: `http://catalogue:3001`) et non `localhost`.

## 3. Rate Limiting

### Bloqué par la Gateway (429 Too Many Requests)
**Symptôme** : Vous recevez une erreur 429 lors de tests manuels.
**Solution** :
- Attendez 60 secondes pour que la fenêtre glissante se réinitialise.
- Pour les tests intensifs, vous pouvez augmenter la limite dans `gateway/rate-limiter.js`.

## 4. Logs et Debugging

### Voir les erreurs en temps réel
Utilisez la commande suivante pour filtrer uniquement les erreurs dans les logs de tous les services :
```bash
docker compose logs -f | grep "ERROR"
```

### Accéder à un conteneur
Si vous avez besoin d'inspecter l'environnement interne d'un service :
```bash
docker exec -it <nom_du_conteneur> sh
```
