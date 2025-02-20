FROM node:18-alpine

ENV NODE_OPTIONS=--openssl-legacy-provider

WORKDIR /app
COPY package.json ./
RUN yarn cache clean && \
    yarn install --force && \
    yarn cache clean

COPY . .

EXPOSE 3000
CMD ["yarn", "start"]
