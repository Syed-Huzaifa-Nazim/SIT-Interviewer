# Stage 1: Build the React application
FROM node:20-alpine AS build

WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install packages
RUN npm install

# Copy application source
COPY . .

# Build application
RUN npm run build

# Stage 2: Serve the build assets with Nginx
FROM nginx:alpine

# Copy built bundle from stage 1
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
