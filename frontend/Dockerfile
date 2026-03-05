FROM node:20-alpine AS builder

WORKDIR /app

# Update npm to version that supports workspaces
RUN npm install -g npm@latest

# Copy root package files and frontend with all dependencies structure
COPY package*.json ./
COPY packages ./packages
COPY frontend ./frontend

# Install all dependencies using npm workspaces from root
RUN npm install --force --legacy-peer-deps 2>/dev/null || npm install --force

FROM node:20-alpine

RUN npm install -g npm@latest

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app ./

WORKDIR /app/frontend

EXPOSE 3000

CMD ["npm", "run", "dev"]
