# Usamos una versión ligera de Node (Alpine)
FROM node:18-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos primero los requisitos para aprovechar el caché
COPY package*.json ./

# Instalamos solo las dependencias de producción
RUN npm install --production

# Copiamos el resto del código
COPY . .

# Exponemos el puerto 3000
EXPOSE 3000

# Comando para iniciar
CMD ["node", "server.js"]
