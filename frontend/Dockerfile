# Etapa de construcción (build)
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa final (producción)
FROM nginx:alpine
# Copia los archivos estáticos generados en la etapa anterior
COPY --from=build /app/build /usr/share/nginx/html
# El contenedor escuchará en el puerto 80
EXPOSE 80
# Comando para iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]