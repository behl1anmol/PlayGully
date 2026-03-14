FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server/ ./server/
COPY shared/ ./shared/
COPY server/public/ ./server/public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
