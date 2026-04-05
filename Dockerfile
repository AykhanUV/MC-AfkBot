FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5050
ENV PORT=5050
CMD ["node", "src/index.js"]
