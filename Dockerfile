FROM balenalib/aarch64-alpine-node:14-latest

RUN apk add fio

WORKDIR /usr/src/app

COPY ./start.sh ./start.sh
RUN chmod +x ./start.sh

COPY ./api ./api
RUN cd api && npm install

COPY ./ui/build ./ui/build

CMD ["./start.sh"]