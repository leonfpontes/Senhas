FROM node:20-alpine

WORKDIR /app

# Copy root package files, workspace packages, and frontend
COPY package*.json ./
COPY packages ./packages
COPY frontend ./frontend

# Single install from root (workspaces resolves frontend deps)
RUN npm install --legacy-peer-deps

WORKDIR /app/frontend

EXPOSE 3000

CMD ["npm", "run", "dev"]
