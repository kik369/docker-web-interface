FROM node:18-alpine

ENV NODE_OPTIONS=--openssl-legacy-provider
ENV PORT=3002

WORKDIR /app
COPY package.json ./
COPY package-lock.json ./

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3002
CMD ["npm", "start"]
