FROM node:alpine

ADD "package.json" /app/

WORKDIR /app

RUN apk add git

RUN npm install --production

ADD . /app

RUN mkdir -p /var/log/node_apps/

EXPOSE 7001

# RUN ./node_modules/.bin/jsdoc -c ./jsdoc.conf -d public/js-docs

CMD ["npm", "run", "start"]
