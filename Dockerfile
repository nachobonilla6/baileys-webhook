FROM node:20-slim
RUN apt-get update && apt-get install -y git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install
ARG CACHEBUST=1
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
