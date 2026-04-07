FROM node:22-alpine
WORKDIR /app
RUN echo 'const http = require("http"); http.createServer((req, res) => { res.writeHead(200); res.end("ok"); }).listen(3000);' > server.js
EXPOSE 3000
CMD ["node", "server.js"]
