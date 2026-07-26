# 06 — Problemas conocidos y soluciones

## Empieza por aquí

```bash
cd /home/ubuntu/api && node diagnostico.mjs
```

Prueba los cuatro saltos que recorre una respuesta —bot → Chatwoot → Evolution →
WhatsApp— por separado y dice cuál falla. Está pensado justo para los casos en
que los logs del bot parecen normales pero el cliente no recibe nada.

---

## Tabla de referencia rápida

| Problema | Causa | Solución |
|----------|-------|----------|
| Recibe mensajes pero no responde por WhatsApp | Algún salto de salida roto | `node diagnostico.mjs` |
| Chatwoot no entrega nada a WhatsApp (ni el bot ni los agentes) | La `url` de Evolution apunta a la IP pública de EC2 | Cambiarla a `http://chatwoot-rails-1:3000` |
| Error 401 al enviar mensajes | Token del bot desincronizado | Extraer token fresco con `rails runner "puts AgentBot.first.access_token.token"` y actualizar `.env` |
| *"Conversation marked open due to error with agent bot"* | Webhook URL incorrecta o ruta cambiada | Verificar que `outgoing_url` del bot coincida con la ruta de `index.js` |
| WhatsApp desconectado (`state: close`) | Sesión expirada o servidor reiniciado | Generar nuevo QR vía Evolution API |
| Bot no recibe mensajes nuevos | `conversationPending: false` en Evolution API | Actualizar a `true` vía `POST /chatwoot/set/ventas` |
| Docker cambia IP interna al reiniciar | Docker recrea redes virtuales | Verificar con `docker exec chatwoot-rails-1 ip route show \| grep default` |
| DeepSeek rechaza el modelo | La API cambió nombres de modelos | Actualizar `DEEPSEEK_MODEL` en `.env` (actualmente `deepseek-v4-flash`) |

---

## El bot recibe los mensajes pero no responde por WhatsApp

**Síntoma.** En `pm2 logs ai-bot` se ve todo el ciclo: `[📥 CLIENTE]`, el
contexto, `[🤖 MARCOS]` con la respuesta generada. Pero el cliente no recibe
nada. Y si escribe "agente", tampoco pasa nada.

**Por qué las dos cosas a la vez.** Porque son la misma cosa. El bot usa **dos
caminos distintos** y solo uno aparece en sus logs:

```
entrada:  Chatwoot (Sidekiq)  ──POST /webhook──▶  bot
salida:   bot  ──POST /api/v1/...──▶  Chatwoot  ──▶  Evolution  ──▶  WhatsApp
```

Sidekiq llama al bot: por eso los mensajes entran. El bot llama a la API de
Chatwoot: responder y traspasar a un agente **son las dos llamadas de salida**,
con la misma URL y el mismo token. Si la salida está rota, se caen justo esas
dos y nada más — que es exactamente el síntoma.

**Diagnóstico.**

```bash
cd /home/ubuntu/api
node diagnostico.mjs
```

Sin argumentos comprueba lo que puede. Para la prueba decisiva —un envío real—
hace falta una conversación; la busca en Redis, y si no la encuentra:

```bash
node diagnostico.mjs --conversation 42     # el id sale de la URL en Chatwoot
```

Ese envío escribe una **nota privada**: mismo endpoint, mismo token y misma
conversación que un mensaje normal, pero el cliente no la ve. Es la única forma
de validar el token del AgentBot sin escribirle a nadie, porque Chatwoot lo
valida contra la inbox de la conversación y no existe un endpoint de "¿este
token sirve?".

**Las cuatro causas que separa.**

| Veredicto | Qué pasó | Arreglo |
|-----------|----------|---------|
| `CHATWOOT_BASE_URL` apunta a una dirección muerta | Docker recreó sus redes y cambió la gateway | El script dice qué URL sí responde: ponla en el `.env` y `pm2 restart ai-bot --update-env` |
| Chatwoot rechaza el token | `CHATWOOT_ACCESS_TOKEN` desincronizado | Ver *Error 401* más abajo |
| Sesión de WhatsApp caída | `state` distinto de `open` | Volver a vincular desde el panel |
| Chatwoot acepta pero no llega | El salto Chatwoot → Evolution | Ver abajo |

**Si el veredicto es el cuarto.** Abre la conversación en Chatwoot. Si las
respuestas del bot **están ahí** pero no llegaron al teléfono, el bot hizo su
trabajo y el fallo está en la entrega de Chatwoot a Evolution. Lo más habitual
es que se recreara la instancia de Evolution y ahora exista un buzón nuevo:

```bash
# Relanza el diagnóstico con un token de usuario para ver los buzones
CHATWOOT_USER_TOKEN=<token de Perfil → Access Token> node diagnostico.mjs
```

Dos buzones de tipo API es la firma de ese caso: los mensajes entran por el
nuevo y el AgentBot sigue colgado del viejo.

**Prevención.** El bot ahora comprueba la salida al arrancar. En `pm2 logs
ai-bot`, tras `📄 instrucciones.txt cargado`, debe salir:

```
🔌 Chatwoot alcanzable en http://172.17.0.1:3000 (HTTP 200)
```

Si en su lugar sale `🚨 NO se alcanza Chatwoot en …`, el problema está
identificado antes de que ningún cliente se quede sin respuesta.

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

## El bot ignora sus reglas: habla de otros temas o dice que es DeepSeek

**Síntoma.** Marcos responde sobre fútbol, política o cualquier cosa; acepta que
un cliente le cambie el nombre; revela que es DeepSeek; usa markdown y respuestas
largas. Nada de `instrucciones.txt` se aplica.

**Causa.** No está leyendo el archivo, y cae a un prompt de reserva de una sola
frase: `'Eres Marcos, asistente virtual.'`. Sin reglas, sin catálogo y sin
restricciones, el modelo se comporta como un asistente genérico.

Ocurría porque la ruta era relativa (`readFileSync('instrucciones.txt')`), que
Node resuelve contra el **directorio de trabajo del proceso**, no contra el del
script. Si PM2 arrancó el bot desde otro sitio, no lo encuentra. Y el error se
tragaba en un `catch` vacío, así que no aparecía en ningún log.

**Comprobar.** En `pm2 logs ai-bot`, al arrancar debe salir:

```
📄 instrucciones.txt cargado (2042 bytes)
```

Si en su lugar sale `🚨 NO se pudo leer ...`, es esto. El mensaje incluye la
ruta donde lo buscaba.

También se puede ver el directorio desde el que corre el proceso:

```bash
pm2 describe ai-bot | grep -i "exec cwd\|script path"
```

**Solución.** Ya está corregido: la ruta se deriva de la ubicación del propio
`index.js`, así que funciona sea cual sea el directorio de arranque. Si aparece
el aviso, comprueba que `instrucciones.txt` está junto a `index.js`.

> **Por qué importa más de lo que parece.** Con el prompt de reserva, el bot
> atiende a clientes reales sin ninguna restricción: puede inventar precios,
> hablar de lo que sea y contar qué modelo hay detrás. Además la regla que
> devuelve `[HUMAN_HANDOFF]` tampoco está, así que solo funciona el atajo de
> escribir exactamente "agente".

---

## El cliente pide agente y la conversación no llega a la bandeja

**Síntoma.** El bot responde "Te comunico con uno de nuestros asesores", la
conversación desaparece del bot, pero el agente no la ve.

**Causa.** El traspaso son **dos pasos** y solo se hacía uno. Poner la
conversación en `open` la saca de la cola del bot, pero si nadie la tiene
asignada, Chatwoot la deja en **"Sin asignar"** — que no es la vista que un
agente mira por defecto ("Míos").

**Comprobar.** En Chatwoot, cambia el filtro de la bandeja a "Sin asignar": si
las conversaciones están ahí, es esto.

Desde el servidor:

```bash
sudo docker exec chatwoot-rails-1 bundle exec rails runner "
Conversation.where(status: :open).last(5).each { |c|
  puts \"##{c.display_id}  asignada_a=#{c.assignee_id.inspect}  equipo=#{c.team_id.inspect}\"
}"
```

Un `asignada_a=nil` confirma el diagnóstico.

**Solución.** Definir a quién se asigna, en el `.env` del bot:

```bash
# Ver los ids disponibles
sudo docker exec chatwoot-rails-1 bundle exec rails runner \
  "Account.find(2).users.each { |u| puts \"#{u.id}  #{u.email}\" }"
sudo docker exec chatwoot-rails-1 bundle exec rails runner \
  "Account.find(2).teams.each { |t| puts \"#{t.id}  #{t.name}\" }"
```

Luego `CHATWOOT_HANDOFF_ASSIGNEE_ID` (o `CHATWOOT_HANDOFF_TEAM_ID`) en
`/home/ubuntu/api/.env` y `pm2 restart ai-bot --update-env`.

**Alternativa sin tocar el bot.** Activar el reparto automático en la Inbox:
Settings → Inboxes → ventas → Collaborators → *Enable auto assignment*. Chatwoot
reparte entonces las conversaciones abiertas entre los agentes disponibles. Es
más cómodo con varios agentes; la variable es más predecible con uno solo.

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

**Solución.** Ver *Cómo cambiar la configuración de Chatwoot en Evolution* más
abajo: `conversationPending` se corrige con la misma receta que cualquier otro
campo.

`conversationPending` solo afecta a conversaciones **nuevas**. Las que ya están
abiertas siguen abiertas, así que para comprobar el arreglo hay que resolver la
conversación en Chatwoot o escribir desde un número que no haya escrito antes.

---

## Evolution no entrega los mensajes salientes de Chatwoot

**Síntoma.** Los mensajes entran a Chatwoot con normalidad, pero los que salen
—los del bot y los que escribe un agente a mano— se quedan ahí y nunca llegan al
WhatsApp del cliente. En Sidekiq, el `WebhookJob` hacia
`http://evo-api:8080/chatwoot/webhook/ventas` falla a los 5 s con
`Net::ReadTimeout`.

**Causa.** La `url` que Evolution tiene guardada para Chatwoot no es alcanzable
**desde dentro del contenedor de Evolution**. El caso más traicionero es
apuntarla a la **IP pública de la instancia EC2**: parece razonable, la ves
funcionar desde el navegador, y desde dentro del contenedor no funciona nunca.
AWS **no hace hairpin NAT** hacia la IP pública de la propia instancia, así que
esa conexión sale al gateway de internet y no vuelve.

**Comprobar.**

```bash
EK=$(grep '^EVOLUTION_API_KEY' /home/ubuntu/aimanagement/server/.env | cut -d= -f2-)
curl -s "http://localhost:8080/chatwoot/find/ventas" -H "apikey: $EK"; echo
```

Si `url` es una IP pública, es esto. Y para confirmarlo sin adivinar, se prueba
desde dentro del propio contenedor:

```bash
sudo docker exec evo-api node -e 'fetch("http://chatwoot-rails-1:3000/").then(r=>console.log("OK HTTP "+r.status)).catch(e=>console.log("FALLA "+(e.cause?.code||e.message)))'
```

**Solución.** Usar el **nombre del contenedor**, no una IP. `evo-api` y Chatwoot
comparten la red `chatwoot_default`, así que el DNS interno de Docker resuelve
`chatwoot-rails-1` sin pasar por ninguna gateway — y sobrevive a que Docker
recree sus redes, que es justo lo que rompe las IPs literales:

```
url: http://chatwoot-rails-1:3000
```

Si los contenedores no comparten red, se conectan una vez y ya:

```bash
sudo docker network connect chatwoot_default evo-api
```

---

## Cómo cambiar la configuración de Chatwoot en Evolution

`POST /chatwoot/set` **reemplaza el objeto entero**, no hace merge: los campos
que omitas se pierden. Y no se puede reenviar tal cual lo que devuelve
`/chatwoot/find`, porque `find` devuelve `null` en los campos vacíos y el
esquema de `set` los rechaza:

```json
{"status":400,"error":"Bad Request",
 "response":{"message":[["daysLimitImportMessages is not of a type(s) number"]]}}
```

La receta que funciona: leer la configuración actual, quitar los nulos y el
`webhook_url` (que es derivado), cambiar solo lo que interese, y reenviarla
completa.

```bash
EK=$(grep '^EVOLUTION_API_KEY' /home/ubuntu/aimanagement/server/.env | cut -d= -f2-)

curl -s http://localhost:8080/chatwoot/find/ventas -H "apikey: $EK" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const c=JSON.parse(s);
      delete c.webhook_url;
      for (const k of Object.keys(c)) if (c[k]===null) delete c[k];
      c.url="http://chatwoot-rails-1:3000";     // <- lo que quieras cambiar
      c.conversationPending=true;
      console.log(JSON.stringify(c));
    })' > /tmp/cw.json

curl -s -X POST http://localhost:8080/chatwoot/set/ventas -H "apikey: $EK" \
  -H 'Content-Type: application/json' -d @/tmp/cw.json; echo
```

Leer y reenviar en vez de escribir el JSON a mano evita las dos formas de
romperlo: omitir un campo, y transcribir mal el token de la inbox.

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

> **Antes el bot ni siquiera arrancaba sin Redis.** `node-redis` reintenta la
> conexión indefinidamente por defecto, y mientras tanto `connect()` no resuelve
> ni rechaza. Como esa llamada está en el nivel superior del módulo, el proceso
> se quedaba colgado **antes** de escuchar en el 5000: PM2 lo mostraba "online"
> y no respondía a nada. Ahora se rinde tras tres intentos y arranca sin
> memoria, que es la degradación prevista.

Si Redis escucha en otro sitio, `REDIS_URL` en el `.env` lo redirige.

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
