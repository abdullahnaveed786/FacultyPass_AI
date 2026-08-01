# Stage 1: Build React assets
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependency files
COPY package.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Nginx server hosting static bundle
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
