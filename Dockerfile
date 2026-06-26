FROM node:20-slim
RUN apt-get update && apt-get install -y git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN --mount=type=bind,target=. npm install
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
