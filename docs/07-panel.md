# 07 — Panel "AI Management"

Panel de administración web para operar el bot sin entrar por SSH.

> **Estado.** El frontend está implementado en [`panel/`](../panel): Next.js 15
> con App Router, autenticación con Supabase y las cinco páginas del plan.
>
> **El middleware del servidor AWS todavía NO existe.** Sin él, el panel
> arranca y autentica, pero cada página muestra el aviso "Sin conexión con el
> servidor": no hay nada al otro lado que responda a sus llamadas. La sección
> "Middleware en el servidor AWS" de este documento es su especificación.

---

## Stack

- **Next.js 15** (App Router) + Tailwind CSS + **shadcn/ui**
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

El panel necesita un servicio intermedio en el servidor (**puerto 5001**) que
exponga endpoints seguros para que Vercel pueda operar la infraestructura.
Vercel **nunca** habla directamente con Chatwoot, Evolution, Redis ni PM2.

```
Navegador → Vercel (API Routes) → Middleware :5001 → {archivos, PM2, Redis, APIs}
```

### Endpoints previstos

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
| `GET` | `/api/whatsapp/state` | Proxy a `connectionState` de Evolution |
| `POST` | `/api/whatsapp/connect` | Generar QR |
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

**Logs en tiempo real.** `/logs` con polling cada pocos segundos es más simple y
suficiente para este volumen. SSE o WebSocket solo si el polling se queda corto.

---

## Orden de trabajo sugerido

1. **Middleware primero**, con `/api/health` y `/api/logs` (solo lectura). Es lo que
   permite validar la conectividad Vercel → AWS sin riesgo de romper el bot.
2. Reverse proxy con TLS delante del middleware.
3. Next.js + Supabase Auth + `/login` y `/` (dashboard sobre `/api/health`).
4. `/logs` y `/connections` — siguen siendo solo lectura.
5. `/training` con versionado y rollback — primera funcionalidad de escritura.
6. `/settings` — la más sensible; lista blanca de claves y enmascarado obligatorios.

Cada escalón añade riesgo sobre el anterior; llegar a un panel de solo lectura ya
cubre la mayor parte del valor operativo diario.
