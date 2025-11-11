FROM node:16.17-alpine

WORKDIR /usr
COPY package.json ./
#COPY .env ./
COPY tsconfig.json ./
COPY src ./src
COPY db-management ./db-management
COPY schema ./schema
COPY .db-migraterc ./
RUN ls -a
RUN npm install @azure/service-bus@7.9.4
RUN npm install @azure/storage-blob@12.18.0
RUN npm install
RUN npm run build

EXPOSE 8080

# CMD [ "node", "./build/server.js" ]
CMD [ "npm", "run", "start-prod" ]