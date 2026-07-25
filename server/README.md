# Middleware AI Management

Servicio que conecta el panel desplegado en Vercel con la infraestructura del
servidor AWS. El panel **nunca** habla directamente con Chatwoot, Evolution,
Redis ni PM2: todo pasa por aquí.

```
Navegador → Vercel (route handlers) → este middleware :5001 → {archivos, PM2, Redis, APIs}
```

Node.js + Express. Tres dependencias (`express`, `dotenv`, `redis`), a
propósito: el servidor va al 95 % de RAM.

---

## Instalación

```bash
cd /home/ubuntu
git clone <repo> aimanagement && cd aimanagement/server
npm install --omit=dev

cp .env.example .env
nano .env          # rellenar (ver abajo)

pm2 start ecosystem.config.cjs
pm2 save
```

### Generar la clave compartida

```bash
openssl rand -hex 32
```

El **mismo** valor va en dos sitios:

- `PANEL_API_KEY` en el `.env` de este servicio
- `AGENT_API_KEY` en las variables de entorno de Vercel

El servicio **se niega a arrancar** si la clave falta o mide menos de 32
caracteres. Es deliberado: arrancar sin clave dejaría la infraestructura
abierta a cualquiera que alcanzara el puerto, y un servicio que no arranca es
un fallo visible; uno abierto no.

### Rellenar el resto del .env

Los valores salen del servidor:

```bash
# Token del AgentBot (mismo que usa el bot)
sudo docker exec chatwoot-rails-1 bundle exec rails runner \
  "puts AgentBot.first.access_token.token"

# API key de DeepSeek y demás
sudo cat /home/ubuntu/api/.env
```

---

## Comprobar que funciona

```bash
# 1. El proceso responde (no requiere clave)
curl -s http://localhost:5001/ping
# → {"ok":true}

# 2. Sin clave debe rechazar
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5001/api/health
# → 401

# 3. Con clave, estado agregado
curl -s -H "Authorization: Bearer $PANEL_API_KEY" \
  http://localhost:5001/api/health
```

Si `/api/health` responde con los cinco servicios, el middleware está listo y
solo falta apuntar el panel hacia él.

---

## Endpoints

Todos bajo `/api`, todos exigen `Authorization: Bearer <PANEL_API_KEY>`.

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/health` | Estado agregado de los cinco servicios |
| `GET` | `/instructions` | Leer `instrucciones.txt` |
| `PUT` | `/instructions` | Escribir (archiva la versión anterior) |
| `GET` | `/instructions/versions` | Historial |
| `POST` | `/instructions/rollback` | Restaurar una versión |
| `DELETE` | `/instructions/versions/:id` | Eliminar una versión del historial |
| `GET` | `/env` | Leer `.env` con los secretos enmascarados |
| `PUT` | `/env` | Actualizar variables de la lista blanca |
| `POST` | `/restart` | `pm2 restart ai-bot --update-env` |
| `GET` | `/logs` | Últimas N líneas de PM2 |
| `GET` | `/logs/stream` | Logs en tiempo real (Server-Sent Events) |
| `POST` | `/logs/clear` | Vaciar los logs (`pm2 flush`) |
| `GET` | `/whatsapp/state` | Estado de la conexión de WhatsApp |
| `GET` | `/whatsapp/qr` | Generar QR de vinculación |
| `POST` | `/whatsapp/connect` | Igual que `/whatsapp/qr` (compatibilidad) |
| `POST` | `/whatsapp/logout` | Cerrar la sesión de WhatsApp |
| `GET` | `/redis/conversations` | Memoria por conversación |
| `DELETE` | `/redis/conversations/:id` | Borrar la memoria de una conversación |

`/ping` es la única ruta sin autenticar. No revela nada del sistema: solo
confirma que el proceso está vivo, para diagnosticar desde el propio servidor
sin tener la clave a mano.

---

## Decisiones de seguridad

**Comparación de la clave en tiempo constante.** Se comparan los SHA-256 y no
las cadenas: `timingSafeEqual` exige buffers del mismo tamaño, y compararlas
directamente obligaría a comprobar antes la longitud, filtrándola. Los digests
miden siempre 32 bytes.

**Escrituras atómicas.** `instrucciones.txt` se escribe a un temporal del mismo
directorio y se renombra. El bot lee ese archivo en **cada mensaje entrante**;
una escritura en sitio puede ser leída a medias y dejarlo con un prompt
truncado. Con `rename` el lector ve el contenido viejo entero o el nuevo
entero, nunca una mezcla.

**Lista blanca del `.env`.** Solo se aceptan `DEEPSEEK_MODEL`,
`CHATWOOT_BASE_URL`, `DEEPSEEK_API_KEY` y `CHATWOOT_ACCESS_TOKEN`. El archivo
alimenta el entorno de un proceso en ejecución, así que aceptar claves
arbitrarias sería una vía de inyección. Los valores con saltos de línea se
rechazan: partirían el archivo y permitirían declarar una variable extra.

**Secretos enmascarados.** `GET /env` devuelve `sk-s…1234`, nunca la clave
completa. Y si el panel reenvía ese valor enmascarado, se ignora en lugar de
sobrescribir la clave real — sin eso, guardar cualquier cambio destruiría las
credenciales del bot.

**PM2 por `execFile`.** Siempre con lista de argumentos, nunca componiendo una
cadena para el shell. Hoy ningún argumento viene del usuario, pero hacerlo por
shell dejaría la puerta abierta a que un cambio futuro introdujera inyección
sin que nadie lo notara.

**Rutas del historial validadas por formato.** El identificador de versión debe
casar con `AAAAMMDD-HHMMSS.txt` exacto, más una comprobación de que la ruta
resuelta sigue dentro del directorio del historial. Así `../../` no llega nunca
a `path.join`.

**Redis falla rápido.** El cliente se configura sin reintentos y con timeout de
3 s. Por defecto node-redis reintenta indefinidamente, lo que dejaría
`/api/health` colgado justo cuando Redis está caído — es decir, cuando más
falta hace el dashboard.

**Límite de peticiones.** 120/min en general, 3/min en `/restart`,
`/whatsapp/logout` y `/logs/clear`, 5/min en el QR. El reinicio corta el servicio unos segundos,
el QR equivale a una sesión de WhatsApp, el logout deja al bot incomunicado
hasta que alguien escanee un código nuevo, y `pm2 flush` trunca los archivos sin
archivarlos: destruye justo el historial que hace falta para diagnosticar un
incidente.

**Logs en tiempo real.** `/logs/stream` sigue el crecimiento de los archivos de
PM2 sondeando su tamaño cada segundo, en vez de `fs.watch`: watch se comporta
distinto según el sistema de archivos y puede perder eventos o duplicarlos.
Detecta la rotación (`pm2 flush`) porque el archivo encoge, y en ese caso vuelve
a leer desde cero. Un latido cada 15 s mantiene viva la conexión frente a
proxies que cortan por inactividad.

---

## Pendiente antes de exponerlo

**TLS.** La clave viaja en cada petición. Sobre HTTP plano es una clave
regalada al primer intermediario. Pon un reverse proxy con certificado
(Caddy o Nginx + Let's Encrypt) delante y **no abras el 5001 al mundo**.

Con Caddy son dos líneas:

```
middleware.tudominio.com {
    reverse_proxy localhost:5001
}
```

Después, `AGENT_API_URL` en Vercel apunta a `https://middleware.tudominio.com`.

**Security Group.** Mantén el 5001 cerrado desde fuera. El único que debe
alcanzarlo es el reverse proxy, en la misma máquina.
