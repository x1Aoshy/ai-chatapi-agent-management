# 08 — Seguridad, credenciales y rotación

## ⚠️ Por qué este documento no contiene los valores reales

La documentación original incluía las credenciales de producción en texto plano.
**No están versionadas aquí a propósito.**

Un secreto que entra en un repositorio de git no se borra con un commit posterior:
queda en el historial, en los forks, en los clones locales de cada colaborador y en
la caché de la plataforma. La única forma real de retirarlo es **rotarlo**.

Además, esos valores ya circularon fuera del servidor (en un documento compartido),
por lo que deben considerarse comprometidos con independencia de este repositorio.

**Acción recomendada: rotar los cuatro secretos de la tabla siguiente.** El
procedimiento está más abajo.

---

## Inventario de credenciales

| Servicio | Clave | Marcador | Dónde vive el valor real |
|----------|-------|----------|--------------------------|
| Evolution API | `apikey` | `<EVOLUTION_API_KEY>` | Variable de entorno del contenedor de Evolution |
| Chatwoot Bot | `api_access_token` | `<CHATWOOT_BOT_TOKEN>` | BD de Chatwoot → `AgentBot.first.access_token.token` |
| Chatwoot Inbox | `token` (config de Evolution) | `<INBOX_TOKEN>` | BD de Chatwoot → token del Inbox `ventas` |
| DeepSeek | `DEEPSEEK_API_KEY` | `<DEEPSEEK_API_KEY>` | `/home/ubuntu/api/.env` y consola de DeepSeek |

### Datos no secretos (referencia)

| Dato | Valor |
|------|-------|
| Chatwoot Account ID | `2` |
| Chatwoot Inbox ID | `1` |
| AgentBot ID | `1` |
| Nombre de la instancia de Evolution | `ventas` |
| Modelo de DeepSeek | `deepseek-v4-flash` |
| IP pública del servidor | Ver consola de AWS EC2 |

---

## Recuperar los valores vigentes

```bash
# Token del AgentBot
sudo docker exec chatwoot-rails-1 bundle exec rails runner \
  "puts AgentBot.first.access_token.token"

# Token del Inbox 'ventas'
sudo docker exec chatwoot-rails-1 bundle exec rails runner \
  "puts Inbox.find(1).channel.try(:webhook_verify_token) || Inbox.find(1).inspect"

# API key de DeepSeek y demás variables del bot
sudo cat /home/ubuntu/api/.env

# API key de Evolution
sudo docker inspect <contenedor-evolution> \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -i key
```

> Estos comandos imprimen secretos en pantalla y quedan en el historial del shell.
> Precede cada uno con un espacio (` comando`) para que `bash` no lo registre, o
> limpia con `history -c` al terminar.

---

## Rotación

### 1. Evolution API key

Es la más sencilla y la más urgente: la clave en uso es una frase en español
escrita a mano, del tipo que un ataque de diccionario resuelve. No es una clave
generada, es una contraseña adivinable.

```bash
# Generar una clave fuerte
openssl rand -hex 32
```

Actualizar `AUTHENTICATION_API_KEY` en el `docker-compose.yml` de Evolution,
recrear el contenedor (`docker compose up -d evolution`) y actualizar cualquier
script o cron que la use.

### 2. Token del AgentBot de Chatwoot

```bash
sudo docker exec chatwoot-rails-1 bundle exec rails runner "
bot = AgentBot.first
bot.access_token.regenerate_token
puts bot.reload.access_token.token
"
```

Copiar el token nuevo a `CHATWOOT_ACCESS_TOKEN` en `/home/ubuntu/api/.env` y
`pm2 restart ai-bot --update-env`. **El bot da 401 hasta que se haga este paso**
(ver `06-troubleshooting.md`).

### 3. Token del Inbox

Regenerarlo desde la interfaz de Chatwoot (Settings → Inboxes → `ventas`) y
propagarlo a Evolution con `POST /chatwoot/set/ventas`, enviando el objeto de
configuración **completo** — ese endpoint reemplaza, no fusiona.

### 4. DeepSeek API key

Revocar la key actual desde la consola de DeepSeek, crear una nueva, actualizar
`DEEPSEEK_API_KEY` en `/home/ubuntu/api/.env` y `pm2 restart ai-bot --update-env`.
Revocar es tan importante como crear: mientras la vieja siga activa, sigue
consumiendo el mismo saldo.

### Verificación posterior

Tras cualquier rotación, ejecuta la prueba de humo de `05-operaciones.md`. Un
mensaje real de WhatsApp de ida y vuelta confirma que los cuatro secretos
concuerdan.

---

## Superficie expuesta

Prioridad de mayor a menor:

**1. Puerto 5000 abierto al público sin autenticación.** `POST /webhook` no
verifica ninguna firma. Cualquiera que alcance el puerto puede enviar un payload
con un `conversation.id` y un `account.id` arbitrarios y conseguir que el bot
escriba en una conversación real o queme cuota de DeepSeek. Sidekiq corre en la
misma máquina, así que el puerto no necesita ser público: restringirlo en el
Security Group resuelve el problema sin tocar código. Como defensa en profundidad,
Chatwoot firma sus webhooks — validar esa firma en `index.js` cierra también el
vector local.

**2. Puerto 3000 sobre HTTP plano.** La interfaz de administración de Chatwoot
viaja sin cifrar; las credenciales de los agentes son interceptables. Un reverse
proxy (Caddy o Nginx con Let's Encrypt) en el 443 y cerrar el 3000 es la
corrección estándar.

**3. Puerto 3333 abierto de forma permanente.** Se abre para mostrar el QR de
vinculación y debe cerrarse en cuanto la instancia queda en `state: open`. Un QR
accesible desde Internet es una sesión de WhatsApp entregada a quien lo escanee
primero.

**4. SSH (22) abierto a `0.0.0.0/0`.** Restringir a IPs conocidas y deshabilitar
la autenticación por contraseña (`PasswordAuthentication no` en
`/etc/ssh/sshd_config`).

**5. Sin límite de tasa en la salida a DeepSeek.** Un atacante —o un cliente
insistente— puede agotar el saldo. Un contador por conversación en Redis pone un
techo con poco código.

---

## Prácticas al trabajar con este repositorio

- Nunca hagas commit de `.env`. El `.gitignore` de la raíz lo cubre, pero
  `git add -f` lo salta: verifica con `git status` antes de confirmar.
- Usa `bot/.env.example` como plantilla; mantenlo actualizado cuando añadas
  variables, siempre con valores de ejemplo.
- En los ejemplos de comandos usa variables de entorno (`$EVOLUTION_API_KEY`), no
  literales.
- Si un secreto llega a colarse en un commit, **rótalo**. Reescribir el historial
  ayuda, pero solo la rotación cierra la exposición.
