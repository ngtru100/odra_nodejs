# Basis NodeJS Image
FROM node:alpine

# Öffne Port
EXPOSE 12345

# Kopiere WebScraper
COPY ODRAScraper-NodeJS/index.js /home/node/index.js
COPY ODRAScraper-NodeJS/package.json /home/node/package.json

# Wechsle in den richtigen Ordner
WORKDIR /home/node

# Installiere Dependencies
RUN ["npm", "install"]

# Starter WebScraper
CMD ["npm", "start"]
