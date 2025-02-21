FROM node:18-alpine

ENV NODE_OPTIONS=--openssl-legacy-provider

WORKDIR /app
COPY package.json ./
COPY package-lock.json ./

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
