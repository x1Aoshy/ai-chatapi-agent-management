# 03 — Servicios y APIs

Todos los comandos de este documento se ejecutan **desde el servidor**.
Las variables `$EVOLUTION_API_KEY`, `$CHATWOOT_BOT_TOKEN` e `$INBOX_TOKEN` se
resuelven según `08-seguridad.md` — nunca escribas los valores literales en un
script versionado ni en el historial del shell.

---

## 3.1 Bot IA (Marcos)

| Atributo | Valor |
|----------|-------|
| Ubicación | `/home/ubuntu/api/` |
| Gestor de proceso | PM2, nombre `ai-bot` |
| Puerto | 5000 |
| Ruta del webhook | `POST /webhook` |
| Motor IA | DeepSeek API (`https://api.deepseek.com`) |
| Modelo | `deepseek-v4-flash` |
| Memoria | Redis — 6 mensajes por conversación, TTL 24 h |

### Estructura de archivos

```
/home/ubuntu/api/
├── index.js              # Código principal del bot
├── instrucciones.txt     # Prompt / personalidad / catálogo de Marcos
├── .env                  # Variables de entorno
├── package.json
└── node_modules/
```

### Variables de entorno

```env
DEEPSEEK_API_KEY=<DEEPSEEK_API_KEY>
DEEPSEEK_MODEL=deepseek-v4-flash
CHATWOOT_ACCESS_TOKEN=<CHATWOOT_BOT_TOKEN>
CHATWOOT_BASE_URL=http://172.17.0.1:3000
```

Plantilla versionada: [`bot/.env.example`](../bot/.env.example).

### Comandos

```bash
pm2 status                        # Estado del proceso
pm2 logs ai-bot --lines 30        # Últimas 30 líneas de log
pm2 restart ai-bot --update-env   # Reiniciar releyendo el .env
pm2 save                          # Persistir la lista de procesos
```

> `--update-env` es obligatorio tras editar `.env`. Un `pm2 restart` a secas
> conserva el entorno anterior y el cambio parece no aplicarse.

### Comportamiento

- **Responde 200 de inmediato** y luego procesa, para no bloquear a Sidekiq.
- **Atajo de escalado:** si el mensaje es exactamente `agente` o `agentes`
  (insensible a mayúsculas), transfiere sin llamar a la IA.
- **Escalado por IA:** si la respuesta del modelo contiene `[HUMAN_HANDOFF]`,
  envía el mensaje de transferencia, pasa la conversación a `open` y limpia
  la memoria.
- **Limpieza:** al resolverse la conversación (`conversation_status_changed` o
  `conversation_resolved` con estado `resolved`), borra `chat_history:{id}`.
- **Parámetros de inferencia:** `temperature: 0.7`, `max_tokens: 300`.

---

## 3.2 Chatwoot

| Atributo | Valor |
|----------|-------|
| Contenedores | `chatwoot-rails-1`, `chatwoot-sidekiq-1` |
| URL pública | `http://<SERVER_PUBLIC_IP>:3000` |
| Account ID | `2` |
| Empresa | `empresaprueba` |
| Inbox | `ventas` (ID `1`) |
| Bot vinculado | `Marcos` (AgentBot ID `1`) |

### API REST

```bash
# Listar conversaciones
curl -s "http://172.17.0.1:3000/api/v1/accounts/2/conversations" \
  -H "api_access_token: $CHATWOOT_BOT_TOKEN"

# Enviar mensaje a una conversación
curl -s -X POST "http://172.17.0.1:3000/api/v1/accounts/2/conversations/{ID}/messages" \
  -H "api_access_token: $CHATWOOT_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hola", "message_type": "outgoing"}'

# Cambiar el estado de una conversación
curl -s -X PATCH "http://172.17.0.1:3000/api/v1/accounts/2/conversations/{ID}" \
  -H "api_access_token: $CHATWOOT_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "open"}'
```

### Inspeccionar el AgentBot

```bash
sudo docker exec chatwoot-rails-1 bundle exec rails runner "
bot = AgentBot.first
puts 'Nombre: ' + bot.name
puts 'URL: ' + bot.outgoing_url
puts 'Token: ' + bot.access_token.token
"
```

### Cambiar la URL del webhook

```bash
sudo docker exec chatwoot-rails-1 bundle exec rails runner "
bot = AgentBot.first
bot.update!(outgoing_url: 'http://172.18.0.1:5000/webhook')
puts 'Actualizado: ' + bot.outgoing_url
"
```

### Sobre Sidekiq

- Sidekiq es quien **ejecuta los webhooks del AgentBot** (`AgentBots::WebhookJob`).
  Si Sidekiq está caído, el bot no recibe nada aunque Chatwoot funcione.
- Al cambiar `outgoing_url`, Sidekiq la relee de la base de datos automáticamente:
  **no hace falta reiniciar el contenedor**.
- URL vigente del bot en Chatwoot: `http://172.18.0.1:5000/webhook`.

```bash
sudo docker logs chatwoot-sidekiq-1 --tail 50    # Ver ejecución de jobs
```

---

## 3.3 Evolution API (WhatsApp)

| Atributo | Valor |
|----------|-------|
| Contenedor | Parte del docker-compose de Chatwoot |
| Puerto interno | 8080 |
| API Key | `<EVOLUTION_API_KEY>` |
| Instancia | `ventas` |

### Estado de la conexión

```bash
curl -s "http://localhost:8080/instance/connectionState/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"
# → {"instance":{"instanceName":"ventas","state":"open"}}
```

`state: "open"` = WhatsApp conectado. `close` = sesión caída, hay que re-vincular.

### Configuración de Chatwoot en Evolution

```bash
# Consultar
curl -s "http://localhost:8080/chatwoot/find/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"

# Actualizar
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

**`conversationPending: true` es crítico.** Las conversaciones deben nacer en estado
*pendiente* para que Chatwoot dispare el AgentBot. Si está en `false`, nacen abiertas
y el bot nunca se activa.

### Vincular WhatsApp (QR)

```bash
curl -s "http://localhost:8080/instance/connect/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"
# → {"base64": "data:image/png;base64,..."}
```

Pega el `base64` en la barra del navegador y escanea desde WhatsApp →
Dispositivos vinculados. Cierra el puerto 3333 al terminar.

### Cerrar sesión

```bash
curl -s -X DELETE "http://localhost:8080/instance/logout/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"
```

---

## 3.4 Redis

| Atributo | Valor |
|----------|-------|
| Acceso | `redis://127.0.0.1:6379` |
| Uso | Caché del historial de conversaciones del bot |
| Formato de key | `chat_history:{conversationId}` |
| TTL | 86400 s (24 h) |
| Contenido | Array JSON con los últimos 6 mensajes (3 turnos user/assistant) |

```bash
# Verificar conexión
redis-cli -h 127.0.0.1 ping
# → PONG

# Listar conversaciones en caché
redis-cli -h 127.0.0.1 keys "chat_history:*"

# Ver el historial de una conversación
redis-cli -h 127.0.0.1 get "chat_history:7"

# Ver el TTL restante
redis-cli -h 127.0.0.1 ttl "chat_history:7"

# Borrar la memoria de una conversación
redis-cli -h 127.0.0.1 del "chat_history:7"
```

> `keys "*"` recorre todo el keyspace y bloquea el servidor. En este volumen es
> inofensivo, pero si el tráfico crece conviene usar `scan` en su lugar.

**Degradación elegante:** si Redis no está disponible, el bot arranca igual y
responde sin memoria — cada mensaje se trata como si fuera el primero. El síntoma
es que Marcos se vuelve a presentar en cada turno.
