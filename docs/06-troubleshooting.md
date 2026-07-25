# 06 — Problemas conocidos y soluciones

## Tabla de referencia rápida

| Problema | Causa | Solución |
|----------|-------|----------|
| Error 401 al enviar mensajes | Token del bot desincronizado | Extraer token fresco con `rails runner "puts AgentBot.first.access_token.token"` y actualizar `.env` |
| *"Conversation marked open due to error with agent bot"* | Webhook URL incorrecta o ruta cambiada | Verificar que `outgoing_url` del bot coincida con la ruta de `index.js` |
| WhatsApp desconectado (`state: close`) | Sesión expirada o servidor reiniciado | Generar nuevo QR vía Evolution API |
| Bot no recibe mensajes nuevos | `conversationPending: false` en Evolution API | Actualizar a `true` vía `POST /chatwoot/set/ventas` |
| Docker cambia IP interna al reiniciar | Docker recrea redes virtuales | Verificar con `docker exec chatwoot-rails-1 ip route show \| grep default` |
| DeepSeek rechaza el modelo | La API cambió nombres de modelos | Actualizar `DEEPSEEK_MODEL` en `.env` (actualmente `deepseek-v4-flash`) |

---

## Error 401 al enviar mensajes

**Síntoma.** En `pm2 logs ai-bot`: `❌ Error enviando: 401`. La IA genera la
respuesta correctamente pero el cliente nunca la recibe.

**Causa.** El `CHATWOOT_ACCESS_TOKEN` del `.env` ya no coincide con el token del
AgentBot en la base de datos de Chatwoot. Pasa al recrear el bot, restaurar un
backup o migrar la instancia.

**Solución.**

```bash
# 1. Extraer el token vigente
sudo docker exec chatwoot-rails-1 bundle exec rails runner \
  "puts AgentBot.first.access_token.token"

# 2. Pegarlo en CHATWOOT_ACCESS_TOKEN dentro de /home/ubuntu/api/.env
nano /home/ubuntu/api/.env

# 3. Reiniciar releyendo el entorno
pm2 restart ai-bot --update-env
```

---

## "Conversation marked open due to error with agent bot"

**Síntoma.** Chatwoot marca la conversación como abierta con esa nota y el bot
nunca responde.

**Causa.** Sidekiq no consiguió entregar el webhook: la `outgoing_url` apunta a un
sitio equivocado, el bot está caído, o la ruta cambió.

**Diagnóstico.**

```bash
# ¿A dónde cree Chatwoot que debe enviar?
sudo docker exec chatwoot-rails-1 bundle exec rails runner \
  "puts AgentBot.first.outgoing_url"
# Esperado: http://172.18.0.1:5000/webhook

# ¿Está el bot escuchando?
pm2 status
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:5000/webhook \
  -H 'Content-Type: application/json' -d '{}'
# Esperado: 200

# ¿Alcanza Chatwoot al bot?
sudo docker exec chatwoot-rails-1 curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://172.18.0.1:5000/webhook \
  -H 'Content-Type: application/json' -d '{}'
# Esperado: 200
```

El tercer comando es el decisivo: aísla si el problema es de red entre el
contenedor y el host.

**Solución.** Corregir la URL en la base de datos:

```bash
sudo docker exec chatwoot-rails-1 bundle exec rails runner "
bot = AgentBot.first
bot.update!(outgoing_url: 'http://172.18.0.1:5000/webhook')
puts 'Actualizado: ' + bot.outgoing_url
"
```

Sidekiq relee la URL de la base de datos; no hace falta reiniciarlo.

---

## WhatsApp desconectado (`state: close`)

**Síntoma.** No entra ningún mensaje. `connectionState` devuelve `"state":"close"`.

**Causa.** La sesión de WhatsApp expiró, se cerró desde el teléfono, o el servidor
se reinició y perdió el estado.

**Solución.**

```bash
# 1. Confirmar el estado
curl -s "http://localhost:8080/instance/connectionState/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"

# 2. Generar QR
curl -s "http://localhost:8080/instance/connect/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"

# 3. Pegar el valor de "base64" en la barra del navegador y escanear desde
#    WhatsApp → Dispositivos vinculados

# 4. Verificar
curl -s "http://localhost:8080/instance/connectionState/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"
# → "state":"open"
```

Si el QR no llega a mostrarse, `DELETE /instance/logout/ventas` limpia la sesión
antes de reintentar. **Cierra el puerto 3333 en el Security Group al terminar.**

---

## El QR se escanea pero WhatsApp dice que no se puede vincular

**Síntoma.** El código aparece, el teléfono lo lee, y responde que no se pudo
vincular el dispositivo.

**Causa 1: el código ya había caducado.** Un QR de WhatsApp vive unos 20-30
segundos, bastante menos de lo que parece. Si la pantalla lo refresca más
despacio que eso, casi siempre se escanea uno muerto. El panel lo renueva cada
18 s por este motivo.

**Causa 2: Evolution agotó su cupo.** Cada sesión de emparejamiento emite un
número limitado de códigos (`QRCODE_LIMIT`). Al alcanzarlo sigue devolviendo un
QR, pero ya no vincula. El panel muestra el contador y avisa a partir del
cuarto.

**Solución.** Reiniciar la instancia para arrancar una sesión limpia — botón
"Reiniciar instancia" en el diálogo del QR, o desde el servidor:

```bash
curl -s -X POST "http://localhost:8080/instance/restart/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"
# Evolution 1.x usa PUT en lugar de POST
```

Si tras reiniciar sigue sin vincular, comprueba el estado antes de insistir:

```bash
curl -s "http://localhost:8080/instance/connectionState/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"
```

Un `state: "connecting"` permanente suele significar que la sesión anterior no
se cerró bien: haz `DELETE /instance/logout/ventas` y vuelve a empezar.

---

## El bot no recibe mensajes nuevos

**Síntoma.** Los mensajes llegan a Chatwoot (se ven en el panel web) pero el bot
no reacciona. Nada aparece en `pm2 logs ai-bot`.

**Causa.** `conversationPending: false` en la configuración de Evolution. Las
conversaciones nacen abiertas en lugar de pendientes, y Chatwoot solo dispara el
AgentBot sobre conversaciones pendientes.

**Solución.**

```bash
# Verificar
curl -s "http://localhost:8080/chatwoot/find/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"

# Corregir
curl -s -X POST "http://localhost:8080/chatwoot/set/ventas" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "accountId": "2",
    "token": "'"$INBOX_TOKEN"'",
    "url": "http://172.17.0.1:3000",
    "nameInbox": "ventas",
    "signMsg": false,
    "reopenConversation": true,
    "conversationPending": true
  }'
```

El `POST /chatwoot/set` **reemplaza la configuración completa**, no hace merge:
envía siempre todos los campos, incluido `token`, o perderás los que omitas.

---

## Docker cambia la IP interna al reiniciar

**Síntoma.** Todo funcionaba, se reinició el servidor o Docker, y ahora la
comunicación falla en uno o ambos sentidos.

**Causa.** Docker recrea sus redes virtuales y las gateways pueden cambiar de
subred.

**Diagnóstico.**

```bash
sudo docker exec chatwoot-rails-1 ip route show | grep default
sudo docker network ls
```

**Solución.** Actualizar los dos extremos con las IPs nuevas:

```bash
# 1. Bot → Chatwoot
nano /home/ubuntu/api/.env      # CHATWOOT_BASE_URL=http://<gateway-docker0>:3000
pm2 restart ai-bot --update-env

# 2. Chatwoot → Bot
sudo docker exec chatwoot-rails-1 bundle exec rails runner "
AgentBot.first.update!(outgoing_url: 'http://<gateway-compose>:5000/webhook')
"
```

**Prevención.** Fijar la subred en el `docker-compose.yml` de Chatwoot para que la
gateway sea estable entre reinicios:

```yaml
networks:
  default:
    ipam:
      config:
        - subnet: 172.18.0.0/16
          gateway: 172.18.0.1
```

Alternativa: usar `host.docker.internal` con `extra_hosts` en lugar de una IP
literal, y evitar el problema de raíz.

---

## DeepSeek rechaza el modelo

**Síntoma.** En `pm2 logs ai-bot`: error de la API mencionando el modelo. El
cliente no recibe respuesta.

**Causa.** DeepSeek renombró o retiró el identificador de modelo.

**Solución.** Actualizar `DEEPSEEK_MODEL` en `/home/ubuntu/api/.env` (valor actual:
`deepseek-v4-flash`) y `pm2 restart ai-bot --update-env`.

`index.js` cae a `deepseek-chat` si la variable no está definida, así que borrar la
línea del `.env` es un modo rápido de volver al modelo base mientras se investiga.

---

## Marcos se presenta en cada mensaje

**Síntoma.** El bot repite *"Hola, soy Marcos…"* en cada turno, ignorando la
instrucción de no volver a presentarse.

**Causa.** Redis no está disponible o las keys no persisten. Sin historial, cada
mensaje llega al modelo como si fuera el primero de la conversación.

**Diagnóstico.**

```bash
redis-cli -h 127.0.0.1 ping                      # ¿responde?
redis-cli -h 127.0.0.1 keys "chat_history:*"     # ¿hay keys?
pm2 logs ai-bot | grep -i redis                  # ¿qué dijo el bot al arrancar?
```

Al arrancar, el bot registra `⚡ Redis conectado` o `⚠️ Redis no disponible`. Ese
mensaje es la confirmación directa.

**Solución.** Levantar Redis y reiniciar el bot. Nota que el bot **solo intenta
conectar al arrancar**: si Redis vuelve después, el bot no se reconecta solo y hay
que reiniciarlo con `pm2 restart ai-bot`.

---

## Presión de memoria (RAM al 95 %)

**Síntoma.** El OOM killer mata procesos, `ai-bot` acumula reinicios en
`pm2 status`, o Chatwoot responde con lentitud extrema.

**Diagnóstico.**

```bash
free -h
sudo docker stats --no-stream
pm2 status                        # columna de restarts
dmesg | grep -i "killed process"  # confirmar acción del OOM killer
```

**Mitigaciones inmediatas.**

```bash
pm2 flush ai-bot                  # liberar espacio de logs
sudo docker system prune -a       # limpiar imágenes y capas huérfanas
```

**Mitigación de fondo.** Añadir swap da aire sin cambiar de instancia:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

A medio plazo, con Rails, Sidekiq, PostgreSQL, Redis, Evolution y Node compartiendo
1 GB, la solución real es subir de tipo de instancia. Cualquier servicio adicional
—incluido el middleware del panel— agrava el problema.

---

## El bot responde a sus propios mensajes

**Síntoma.** Bucle infinito de mensajes entre Marcos y sí mismo.

**Causa.** Se rompió el filtro `message_type === 'incoming'` en `index.js`. Las
respuestas del bot también generan eventos `message_created`, con
`message_type: "outgoing"`.

**Solución inmediata.**

```bash
pm2 stop ai-bot
```

Luego restaurar el filtro en la condición del webhook y volver a arrancar. Verifica
también que el evento provenga de un contacto y no del propio AgentBot antes de
procesarlo.
