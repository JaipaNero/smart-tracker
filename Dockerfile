FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend (so the server can serve it)
RUN npm run build

# Expose the port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the server (which also starts the bot)
CMD ["npx", "tsx", "server.ts"]
