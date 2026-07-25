# 01 — Arquitectura general

## Servidor

| Atributo | Valor |
|----------|-------|
| Proveedor | AWS EC2 |
| IP pública | `<SERVER_PUBLIC_IP>` (ver `08-seguridad.md`) |
| IP privada | `172.31.40.23` |
| Sistema operativo | Ubuntu 26.04 LTS |
| RAM | ~1 GB — **uso actual ~95 %** |

> **Nota de capacidad:** con ~1 GB de RAM y 95 % de uso, el servidor está al límite.
> Chatwoot (Rails + Sidekiq), PostgreSQL, Redis, Evolution API y el bot Node conviven
> en la misma instancia. Cualquier servicio nuevo — incluido el middleware del panel
> descrito en `07-panel.md` — debe considerarse contra este presupuesto.
> Ver "Presión de memoria" en `06-troubleshooting.md`.

---

## Diagrama

```
┌─────────────────────────────────────────────────────────────────┐
│                    SERVIDOR AWS EC2                              │
│                    IP Pública: <SERVER_PUBLIC_IP>                │
│                    IP Privada: 172.31.40.23                      │
│                    OS: Ubuntu 26.04 LTS                          │
│                    RAM: ~1GB (uso actual ~95%)                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    DOCKER                                 │   │
│  │                                                           │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                │   │
│  │  │  chatwoot-rails  │  │ chatwoot-sidekiq │               │   │
│  │  │  (Puerto 3000)   │  │  (Worker Jobs)   │               │   │
│  │  └─────────────────┘  └─────────────────┘                │   │
│  │                                                           │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                │   │
│  │  │     Redis        │  │   PostgreSQL     │               │   │
│  │  │  (Puerto 6379)   │  │  (Puerto 5432)   │               │   │
│  │  └─────────────────┘  └─────────────────┘                │   │
│  │                                                           │   │
│  │  ┌─────────────────┐                                      │   │
│  │  │  Evolution API   │                                      │   │
│  │  │  (Puerto 8080)   │                                      │   │
│  │  └─────────────────┘                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              NODE.JS (PM2)                                │   │
│  │                                                           │   │
│  │  ┌─────────────────┐                                      │   │
│  │  │   ai-bot         │                                      │   │
│  │  │  (Puerto 5000)   │                                      │   │
│  │  │  /webhook        │                                      │   │
│  │  └─────────────────┘                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    VERCEL (Panel Web)                            │
│                    aimanagement-panel.vercel.app                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   Next.js 15 (App Router)                                 │   │
│  │   + Supabase Auth + DB                                    │   │
│  │   + shadcn/ui                                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Componentes y responsabilidades

### Docker (stack de Chatwoot)

- **`chatwoot-rails-1`** — Aplicación web y API REST de Chatwoot. Puerto 3000.
- **`chatwoot-sidekiq-1`** — Procesador de jobs en background. **Es quien dispara los
  webhooks del AgentBot** hacia el bot Node. Sin Sidekiq, el bot nunca recibe mensajes.
- **PostgreSQL** — Base de datos de Chatwoot (conversaciones, contactos, inboxes,
  AgentBots y sus tokens). Puerto 5432.
- **Redis (Docker)** — Cola de trabajos de Sidekiq. Puerto 6379.
- **Evolution API** — Puente con WhatsApp. Puerto 8080, solo accesible dentro de Docker.

### Node.js sobre PM2

- **`ai-bot`** — Servidor Express en el puerto 5000 que expone `POST /webhook`.
  Recibe eventos de Chatwoot, consulta DeepSeek, mantiene memoria en Redis y decide
  si responde o escala a un humano.

### Vercel

- **Panel "AI Management"** — Frontend de administración, implementado en `panel/`. Ver
  `07-panel.md`.

---

## Direccionamiento interno

El bot corre en el **host**, no en Docker. Se comunica con Chatwoot a través de la
gateway de la red Docker:

- Bot → Chatwoot: `http://172.17.0.1:3000` (gateway de `docker0`)
- Chatwoot/Sidekiq → Bot: `http://172.18.0.1:5000/webhook` (gateway de la red
  del compose de Chatwoot)

Las dos gateways son **distintas** y **pueden cambiar si Docker recrea sus redes**.
Esta es una fuente recurrente de fallos; ver `06-troubleshooting.md`.

Para verificar la gateway que ve un contenedor:

```bash
sudo docker exec chatwoot-rails-1 ip route show | grep default
```
