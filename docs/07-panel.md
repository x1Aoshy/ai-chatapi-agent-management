# 07 — Panel "AI Management"

Panel de administración web para operar el bot sin entrar por SSH.

> **Estado.** El frontend está implementado en [`panel/`](../panel): Next.js 16
> con App Router, autenticación con Supabase y las cinco páginas del plan.
>
> **El middleware del servidor está implementado** en [`server/`](../server).
> Queda desplegarlo en el servidor AWS y ponerle TLS delante; hasta entonces el
> panel muestra "Sin conexión con el servidor". Instrucciones en
> [`server/README.md`](../server/README.md).

---

## Stack

- **Next.js 16** (App Router) + Tailwind CSS + **shadcn/ui**
- **Supabase** — Auth + PostgreSQL
- **Vercel** — despliegue en `aimanagement-panel.vercel.app`
- Comunicación con el servidor AWS vía API Routes seguras

---

## Páginas

| Ruta | Contenido |
|------|-----------|
| `/login` | Autenticación con Supabase |
| `/` | Dashboard: estado del bot, WhatsApp, estadísticas, gráfica de mensajes |
| `/training` | Editor de `instrucciones.txt` con historial de versiones |
| `/knowledge` | Base de conocimiento vectorial (ver `09-conocimiento.md`) |
| `/connections` | Estado y control de DeepSeek, Chatwoot, WhatsApp, Redis |
| `/logs` | Visor de conversaciones en tiempo real |
| `/settings` | Variables de entorno, modelo IA, TTL de memoria en Redis |

---

## Diseño

- Dark mode (`#0a0a0a`)
- Estilo Vercel/Linear: minimalista, bordes finos de 1 px, sin sombras
- Tipografía Inter
- Componentes shadcn/ui
- Paleta monocromática con acentos verdes para estados "online"

---

## Middleware en el servidor AWS

Servicio intermedio en el servidor (**puerto 5001**) que expone endpoints
seguros para que Vercel pueda operar la infraestructura. Vercel **nunca** habla
directamente con Chatwoot, Evolution, Redis ni PM2.

Implementado en [`server/`](../server). Lo que sigue es la especificación que
cumple; el detalle de despliegue está en su README.

```
Navegador → Vercel (API Routes) → Middleware :5001 → {archivos, PM2, Redis, APIs}
```

### Endpoints

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/api/health` | Estado agregado de todos los servicios |
| `GET` | `/api/instructions` | Leer `instrucciones.txt` |
| `PUT` | `/api/instructions` | Escribir `instrucciones.txt` (con versionado) |
| `GET` | `/api/instructions/versions` | Historial de versiones |
| `POST` | `/api/instructions/rollback` | Restaurar una versión anterior |
| `GET` | `/api/env` | Leer `.env` (**con los secretos enmascarados**) |
| `PUT` | `/api/env` | Actualizar variables de entorno |
| `POST` | `/api/restart` | `pm2 restart ai-bot --update-env` |
| `GET` | `/api/logs` | Últimas N líneas de PM2 |
| `GET` | `/api/logs/stream` | Logs en tiempo real (SSE) |
| `GET` | `/api/whatsapp/state` | Proxy a `connectionState` de Evolution |
| `GET` | `/api/whatsapp/qr` | Generar QR |
| `POST` | `/api/whatsapp/connect` | Igual que el anterior (compatibilidad) |
| `POST` | `/api/whatsapp/logout` | Cerrar la sesión de WhatsApp |
| `GET` | `/api/redis/conversations` | Listar `chat_history:*` |
| `DELETE` | `/api/redis/conversations/:id` | Borrar la memoria de una conversación |

### Autenticación

API key secreta compartida entre Vercel y el servidor, enviada en cada petición:

```
Authorization: Bearer <PANEL_API_KEY>
```

Requisitos mínimos para que esto sea seguro:

- La key vive en las **environment variables de Vercel** (no en el bundle del
  cliente) y en el `.env` del middleware. Nunca en el repositorio.
- Solo las API Routes del lado servidor de Next.js la usan; el navegador jamás la ve.
- Comparación en **tiempo constante** (`crypto.timingSafeEqual`), no `===`.
- **TLS obligatorio.** Una API key sobre HTTP plano es una key regalada al primer
  intermediario. El middleware debe ir detrás de un reverse proxy con certificado.
- Rate limiting en los endpoints de escritura y de reinicio.
- El Security Group debe permitir el 5001 solo desde los rangos de salida de
  Vercel, o —mejor— mantener el puerto cerrado y usar un túnel.

### Consideraciones de implementación

**Escritura de archivos.** `PUT /api/instructions` debe escribir a un temporal y
hacer `rename` (atómico). El bot lee `instrucciones.txt` en cada mensaje entrante;
una escritura en sitio puede ser leída a medias.

**Versionado.** Guardar cada versión previa antes de sobrescribir, con timestamp y
autor. Un directorio `instrucciones.history/` con `YYYYMMDD-HHMMSS.txt` basta y
evita meter una dependencia de base de datos en el servidor.

**Validación de `.env`.** `PUT /api/env` debe aceptar solo una lista blanca de
claves (`DEEPSEEK_MODEL`, `CHATWOOT_BASE_URL`, …). Sin eso, un endpoint que escribe
un archivo arbitrario del que depende un proceso es una vía de ejecución de código.

**Enmascarado.** `GET /api/env` nunca devuelve `DEEPSEEK_API_KEY` ni
`CHATWOOT_ACCESS_TOKEN` en claro. Devuelve `sk-...abc1` y un booleano `isSet`.

**Ejecución de comandos.** `POST /api/restart` debe invocar PM2 con `execFile` y
argumentos fijos, nunca componiendo una cadena de shell con entrada del usuario.

**Presupuesto de memoria.** El servidor está al 95 % de RAM (`01-arquitectura.md`).
Un proceso Node adicional necesita sitio: revisar `free -h` y considerar swap antes
de desplegar el middleware.

**Logs en tiempo real.** Implementado con Server-Sent Events: el middleware
sigue los archivos de PM2 y empuja cada línea nueva. El navegador se conecta a
la route handler del panel con EventSource —que no admite cabeceras propias, y
por eso la API key se añade del lado servidor y nunca llega al cliente.

Vercel corta las funciones al llegar a `maxDuration`, así que la conexión se
reabre cada pocos minutos. El cliente reconecta solo y pide historial únicamente
en la primera conexión, para que un corte no reinyecte líneas ya mostradas.

---

## Puesta en marcha

Las dos piezas están escritas. Lo que queda es desplegar el middleware y
conectar los extremos, en este orden:

1. **Instalar el middleware** en el servidor y arrancarlo con PM2. Verificar en
   local con `curl http://localhost:5001/ping`.
2. **Reverse proxy con TLS** delante. Antes de este paso la clave viaja en
   claro en cada petición, así que no se debe apuntar el panel todavía.
3. **`AGENT_API_URL` y `AGENT_API_KEY`** en Vercel, ámbito Production, y
   redeploy. Vercel no aplica variables nuevas a un despliegue ya hecho.
4. **Comprobar el Dashboard.** Si los cinco servicios aparecen con su estado,
   la cadena completa funciona.

El detalle de cada paso está en [`server/README.md`](../server/README.md).

Si algo falla, el orden de diagnóstico es el mismo: `/ping` sin clave confirma
que el proceso vive; `/api/health` con clave confirma que la autenticación y
las sondas funcionan; y solo entonces tiene sentido mirar el panel.
