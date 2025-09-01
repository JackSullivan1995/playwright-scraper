# Use Playwright’s maintained image with browsers preinstalled
FROM mcr.microsoft.com/playwright:v1.45.2-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm", "start"]

