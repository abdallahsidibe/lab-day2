# Rapport Technique — TP Plateforme E-Commerce Observable

## Q1. Méthodologie 12-Factor App
1. **Codebase** : Respecté. Un seul dépôt Git pour tous les microservices.
2. **Dependencies** : Respecté. Les dépendances sont explicitement déclarées dans `package.json` et isolées via Docker.
3. **Config** : Respecté. Utilisation de variables d'environnement (`PORT`, `URLS_SERVICES`) pour configurer les applications.
4. **Backing Services** : Respecté. Les services sont traités comme des ressources attachées (bien que simulées en mémoire ici).
5. **Build, Release, Run** : Respecté. Docker sépare clairement ces phases (Dockerfile build stage vs run stage).
6. **Processes** : Respecté. Les services sont stateless et s'exécutent comme des processus isolés.
7. **Port Binding** : Respecté. Chaque service expose son propre port (3000-3004).
8. **Concurrency** : Respecté. Chaque service peut être scalé indépendamment via Docker Compose.
9. **Disposability** : Respecté. Graceful shutdown implémenté (gestion de SIGTERM) pour un arrêt propre.
10. **Dev/Prod Parity** : Respecté. Environnement identique grâce à la conteneurisation.
11. **Logs** : Respecté. Les logs sont envoyés sur `stdout` au format JSON, traités comme un flux d'événements.
12. **Admin Processes** : Respecté. Des routes spécifiques (ex: `DELETE /notifications`) permettent des tâches d'administration.

## Q2. Health Checks Kubernetes
- **LivenessProbe** : Vérifie si le conteneur est toujours en vie. S'il échoue, K8s redémarre le conteneur.
- **ReadinessProbe** : Vérifie si le conteneur est prêt à recevoir du trafic. S'il échoue, K8s retire le conteneur du Service (load balancer).
- **Correspondance** : Notre endpoint `/health` actuel mélange les deux. Il vérifie la mémoire (liveness) et la disponibilité des données (readiness).
- **Adaptation** : Créer `/health/live` (retourne 200 tant que le processus tourne) et `/health/ready` (vérifie les connexions aux DBs ou aux services dépendants).

## Q3. Logs sur stdout vs fichiers
- **Pourquoi stdout ?** Dans Docker, les conteneurs sont éphémères. Écrire dans un fichier à l'intérieur du conteneur consomme de l'espace disque et les logs sont perdus à la suppression. `stdout` permet au moteur Docker (ou à un collecteur comme Fluentd) de capturer les logs et de les centraliser sans modifier l'application.
- **docker-compose down** : Les logs stockés dans le moteur Docker pour ces conteneurs sont supprimés. Si on n'a pas de système de centralisation (ELK, Loki), ils sont perdus définitivement.

## Q4. Rate Limiting Multi-Replica
- **Problème** : Avec 3 réplicas, chaque Gateway a son propre `store` en mémoire. Une IP pourrait faire 100 requêtes *sur chaque réplica*, soit 300 requêtes au total, contournant la limite globale.
- **Solution** : Utiliser un store de données partagé et centralisé, comme **Redis**. Toutes les instances de la Gateway consulteraient le même compteur incrémentiel dans Redis via une opération atomique (INCR + EXPIRE).

## Q5. Garantie d'envoi de notification (At-Least-Once)
1. **Message Broker (RabbitMQ/Kafka)** : Au lieu d'appeler HTTP directement, le service Commandes publie un message dans une file d'attente. Le service Notifications consomme ce message quand il est disponible. Si Notifications est down, le message reste dans la file.
2. **Outbox Pattern** : Enregistrer la notification dans la base de données du service Commandes dans la même transaction que la commande (statut `to_send`). Un processus séparé (worker) lit périodiquement cette table et tente d'envoyer les notifications, ne les marquant comme `sent` qu'après succès HTTP.
