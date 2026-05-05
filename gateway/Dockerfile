# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install --production

# Final stage
FROM node:18-alpine
RUN apk add --no-cache wget curl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# SIGTERM signal correctly propagated by node
CMD ["node", "index.js"]
