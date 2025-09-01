FROM mcr.microsoft.com/playwright:v1.45.2-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 3000
CMD ["npm", "start"]


