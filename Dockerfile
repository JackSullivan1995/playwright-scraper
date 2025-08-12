FROM mcr.microsoft.com/playwright:v1.54.0-noble

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server.js"]
