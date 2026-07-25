# Titan Supplements — Bot IA "Marcos" + Titan Panel

Documentación e infraestructura del asistente virtual de WhatsApp de Titan Supplements
y del panel de administración que lo gobierna.

El sistema conecta WhatsApp → Evolution API → Chatwoot → un bot Node.js con DeepSeek,
con memoria conversacional en Redis y escalado a agente humano.

---

## Resumen del stack

| Capa | Tecnología | Dónde corre |
|------|-----------|-------------|
| Canal | WhatsApp vía Evolution API | Docker, puerto 8080 (interno) |
| Mesa de ayuda | Chatwoot (Rails + Sidekiq) | Docker, puerto 3000 |
| Bot IA | Node.js + Express + OpenAI SDK → DeepSeek | PM2, puerto 5000 |
| Memoria | Redis | Local, puerto 6379 |
| Base de datos | PostgreSQL (de Chatwoot) | Docker, puerto 5432 |
| Panel admin | Next.js 15 + Supabase + shadcn/ui | Vercel (planificado) |

---

## Índice de documentación

| Documento | Contenido |
|-----------|-----------|
| [01 — Arquitectura](docs/01-arquitectura.md) | Diagrama general, servidor, distribución de componentes |
| [02 — Red y puertos](docs/02-red-y-puertos.md) | Security Group AWS, puertos, redes Docker |
| [03 — Servicios](docs/03-servicios.md) | Bot IA, Chatwoot, Evolution API, Redis y sus APIs |
| [04 — Flujo de mensaje](docs/04-flujo-mensaje.md) | Recorrido punta a punta de un mensaje |
| [05 — Operaciones](docs/05-operaciones.md) | Runbook: despliegue, reinicios, verificación de salud |
| [06 — Troubleshooting](docs/06-troubleshooting.md) | Problemas conocidos y sus soluciones |
| [07 — Titan Panel](docs/07-titan-panel.md) | Plan del panel Next.js y del middleware en el servidor |
| [08 — Seguridad](docs/08-seguridad.md) | Inventario de credenciales, rotación, superficie expuesta |

---

## Código del bot

El código en producción vive en el servidor bajo `/home/ubuntu/api/`. Una copia de
referencia está versionada en [`bot/`](bot/):

```
bot/
├── index.js            # Motor del bot: webhook, IA, memoria, handoff
├── instrucciones.txt   # Prompt de sistema: personalidad, catálogo, reglas
├── package.json        # Dependencias
└── .env.example        # Plantilla de variables de entorno (sin secretos)
```

Ver [docs/05-operaciones.md](docs/05-operaciones.md) para el procedimiento de despliegue.

---

## Arranque rápido (verificación de salud)

Desde el servidor:

```bash
pm2 status                                                    # bot en línea
redis-cli -h 127.0.0.1 ping                                   # PONG
sudo docker ps --format '{{.Names}}\t{{.Status}}'             # contenedores
curl -s "http://localhost:8080/instance/connectionState/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"                             # state: "open"
```

Los cuatro deben responder antes de dar el sistema por operativo.

---

## ⚠️ Sobre las credenciales

Este repositorio **no contiene secretos**. Las tablas de credenciales usan
marcadores de posición (`<EVOLUTION_API_KEY>`, `<CHATWOOT_BOT_TOKEN>`, …).

Los valores reales viven en `/home/ubuntu/api/.env` en el servidor y en la base de
datos de Chatwoot. [docs/08-seguridad.md](docs/08-seguridad.md) explica cómo
recuperarlos y cómo rotarlos.
