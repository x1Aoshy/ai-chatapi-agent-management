# Imagen del enrutador de IA ("Marcos").
#
# Alpine porque el servidor va justo de RAM y esta imagen convive con Chatwoot,
# Sidekiq, PostgreSQL, Redis y Evolution en la misma máquina.
FROM node:22-alpine

WORKDIR /app

# Las dependencias se copian antes que el código para que Docker reutilice la
# capa de node_modules mientras solo cambie index.js, que es lo que cambia.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js knowledge.js diagnostico.mjs ./
COPY instrucciones.txt ./

# El prompt vive en /data cuando se monta un volumen (ver docker-compose.yml).
# Si no se monta nada, cae al que viene en la imagen.
ENV INSTRUCTIONS_PATH=/app/instrucciones.txt

EXPOSE 5000

# /webhook responde 200 a cualquier POST antes de mirar el cuerpo, así que
# sirve de sonda de vida sin efectos secundarios.
#
# Se usa node y no wget: node está garantizado en esta imagen, mientras que las
# opciones del wget de busybox varían entre versiones.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/webhook',{method:'POST'}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
