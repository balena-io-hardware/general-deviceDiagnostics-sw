
FROM balenalib/aarch64-alpine-node:12-latest as basewithdeps

RUN apk add fio

# api
FROM balenalib/aarch64-debian-node:12.20-buster-build as api-builder

WORKDIR /usr/src/app

# layer one does not change if only code added
COPY api/package.json api/package-lock.json api/tsconfig.json api/
RUN cd api && npm i 

COPY api/app.js api/app.js
COPY api/routes api/routes
COPY api/services api/services
COPY api/sockets api/sockets

RUN cd api && npm run build
#RUN mv api/node_modules api/cached_node_modules

# ui
FROM node:14-alpine as ui-builder

WORKDIR /usr/src/app

COPY ui/package.json ui/package-lock.json ui/tsconfig.json ./ui/
RUN cd ui && npm i

COPY ui/public ui/public
COPY ui/src ui/src

RUN cd ui && npm run build

# final image
FROM basewithdeps

WORKDIR /usr/src/app

COPY ./start.sh ./start.sh
RUN chmod +x ./start.sh

COPY ./api/swagger.json ./api/swagger.yml api/package.json ./api/
COPY ./api/bin ./api/bin
COPY --from=api-builder /usr/src/app/api/node_modules api/node_modules
COPY --from=api-builder /usr/src/app/api/dist ./api/dist

COPY --from=ui-builder /usr/src/app/ui/build ./ui/build

CMD ["./start.sh"]