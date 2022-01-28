FROM balenalib/aarch64-alpine-node:14-latest

RUN apk add fio

WORKDIR /usr/src/app

COPY ./api ./api
RUN cd api && npm install

COPY ./ui/build ./ui/build

COPY ./start.sh ./start.sh
RUN chmod +x ./start.sh

CMD ["./start.sh"]