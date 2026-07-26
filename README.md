# AI Management

A WhatsApp virtual assistant built on top of Chatwoot, plus the admin panel that
runs it.

Customers write to a normal WhatsApp number. Evolution API turns that into a
Chatwoot conversation. Chatwoot hands the conversation to an **AgentBot** — a
small Node.js service in [`bot/`](bot/) — which answers with an LLM, remembers
the last few turns, and steps aside the moment the customer asks for a human.

> The detailed documentation in [`docs/`](docs/) is written in Spanish. This
> README covers the same ground in English, plus how to run it under Docker.

---

## Architecture

```
   Customer's phone
          │  WhatsApp
          ▼
   ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
   │ Evolution API│───────▶│   Chatwoot   │───────▶│   AI router  │
   │  (Baileys)   │◀───────│ Rails+Sidekiq│◀───────│   bot/       │
   └──────────────┘        └──────────────┘        └──────┬───────┘
      :8080                    :3000                      │ :5000
                                                          ├──▶ DeepSeek  (inference)
                                                          ├──▶ Redis     (memory)
                                                          └──▶ Supabase  (knowledge, pgvector)

   ┌──────────────┐        ┌──────────────┐
   │  Panel       │───────▶│  Middleware  │──▶ files · PM2 · Redis · Evolution
   │  Next.js     │        │  server/     │
   │  (Vercel)    │        │  :5001       │
   └──────────────┘        └──────────────┘
```

Two things are worth noticing in that diagram, because most operational
surprises come from them:

**Inbound and outbound take opposite paths.** Chatwoot calls the bot (inbound);
the bot calls Chatwoot's REST API (outbound). Only the inbound leg shows up in
the bot's own logs. When the outbound leg breaks, the bot looks perfectly
healthy — messages arrive, replies get generated — while no customer receives
anything. That is what `bot/diagnostico.mjs` exists to find.

**The panel never touches infrastructure directly.** Vercel talks only to the
middleware in [`server/`](server/), which is the single component allowed to
read files, drive PM2, and call Evolution.

| Layer | Technology | Where it runs |
|-------|-----------|---------------|
| Channel | WhatsApp via Evolution API | Docker, port 8080 |
| Help desk | Chatwoot (Rails + Sidekiq) | Docker, port 3000 |
| AI router | Node.js + Express + OpenAI SDK → DeepSeek | Docker or PM2, port 5000 |
| Memory | Redis | Docker, port 6379 |
| Knowledge | Supabase + pgvector | Supabase (hosted) |
| Admin panel | Next.js 16 + Supabase + shadcn/ui | Vercel |
| Middleware | Node.js + Express | Host, PM2, port 5001 |

---

## What the AI router does

[`bot/index.js`](bot/index.js) is an Express service with exactly one route:
`POST /webhook`. Chatwoot's Sidekiq calls it through `AgentBots::WebhookJob`
every time something happens in a conversation the bot owns.

### Request lifecycle

```
POST /webhook
  │
  ├─▶ 200 OK immediately  ── Sidekiq gets its acknowledgement before any slow
  │                          work starts. Chatwoot times the webhook out at 5 s
  │                          and marks the conversation "open due to error" if
  │                          it does not answer in time.
  │
  ├─ event is conversation_resolved / status → resolved?
  │     └─▶ DEL chat_history:<id>          → done
  │
  ├─ event is message_created, incoming, has content?
  │     │
  │     ├─ message matches /^agente[s]?$/i ?
  │     │     └─▶ hand off to a human, no model call   → done
  │     │
  │     ├─ read instrucciones.txt          (the system prompt)
  │     ├─ read chat_history:<id>          (last 3 exchanges, from Redis)
  │     ├─ search the knowledge base       (top 3 snippets, vector similarity)
  │     ├─ call DeepSeek                   (system + history + message)
  │     │
  │     ├─ reply contains [HUMAN_HANDOFF] ?
  │     │     └─▶ hand off to a human, clear memory    → done
  │     │
  │     └─▶ append the exchange to Redis, POST the reply to Chatwoot
  │
  └─ anything else → ignored
```

Outgoing messages are dropped explicitly. Without that filter the bot would
answer itself forever: its own replies also produce a `message_created` event.

### Escalating to a human

Two routes reach the same place. The **shortcut** fires when the message is
exactly "agente" — no model call, no token spend, instant. The **model route**
fires when DeepSeek returns the `[HUMAN_HANDOFF]` marker, which the system
prompt tells it to emit for medical questions or explicit requests for a person.

Both then do three things, in this order:

1. `POST` the message *"Te comunico con uno de nuestros asesores."*
2. `PATCH` the conversation to `status: open` — this is the step that takes it
   out of the bot's queue and stops it from answering someone who asked for a
   human. If it fails, the handoff aborts rather than continuing half-done.
3. `POST /assignments` to the agent or team in `CHATWOOT_HANDOFF_ASSIGNEE_ID` /
   `CHATWOOT_HANDOFF_TEAM_ID`.

Step 3 is not optional in practice. Without it the conversation lands in
Chatwoot's **"Unassigned"** view, which is not the inbox an agent looks at — the
classic "I asked for a human and nothing happened" report. A failure here is
logged but does not roll back step 2: the bot staying quiet matters more than
who owns the ticket.

### Memory

Redis holds `chat_history:<conversationId>` — a 6-message window (3 exchanges)
with a 24-hour TTL that is renewed on every write, so an active conversation
never expires mid-chat. Memory is cleared when the conversation is resolved,
when a handoff happens, and on expiry.

If Redis is unavailable the bot still answers; it just introduces itself on
every message, because each one looks like the first.

### Knowledge base (RAG)

[`bot/knowledge.js`](bot/knowledge.js) embeds the incoming message, queries a
pgvector table in Supabase for the three most similar snippets above a 0.3
cosine threshold, and appends them to the system prompt inside a delimited
block. Embeddings come from OpenAI or Gemini (`EMBEDDING_PROVIDER`) — DeepSeek
publishes no embeddings API, so inference and vectors come from different
vendors.

Every failure path returns an empty array. A broken embedding provider, an
unreachable Supabase, an expired key — none of them can stop a customer from
getting an answer. The bot simply falls back to `instrucciones.txt` alone and
says so once at startup:

```
🧠 RAG activo (gemini/text-embedding-004)
🧠 RAG inactivo: falta GEMINI_API_KEY, SUPABASE_URL
```

### Startup self-checks

The bot verifies at boot the two things whose absence is otherwise invisible,
and prints the result unconditionally:

```
Enrutador IA listo en puerto 5000
📄 instrucciones.txt cargado (2084 bytes)
🔌 Chatwoot alcanzable en http://chatwoot-rails-1:3000 (HTTP 200)
```

Both checks exist because of real incidents. A missing `instrucciones.txt` used
to fail silently and leave the bot answering customers with a one-sentence
fallback prompt — no rules, no catalogue, no restrictions. An unreachable
Chatwoot leaves the bot receiving and generating normally while nothing reaches
anyone. Neither is detectable from the outside until a customer complains, so
both are loud at startup instead.

---

## Repository layout

```
bot/                  AI router — the service described above
  index.js              webhook, inference, memory, handoff
  knowledge.js          vector retrieval (RAG)
  diagnostico.mjs       end-to-end delivery diagnostics
  instrucciones.txt     system prompt: persona, catalogue, rules
  Dockerfile
server/               Middleware between the panel and the infrastructure
panel/                Next.js 16 admin panel (deployed on Vercel)
supabase/migrations/  pgvector schema for the knowledge base
docs/                 Full documentation (Spanish)
docker-compose.yml    AI router + Redis
```

---

## Running with Docker

Chatwoot and Evolution API already run as their own Docker stacks with their own
compose files; this repository does not try to own them. What
[`docker-compose.yml`](docker-compose.yml) adds is the AI router and its Redis,
**joined to the existing `chatwoot_default` network** so every hop resolves by
container name.

That last detail matters more than it looks. Hard-coded IPs like `172.17.0.1`
break whenever Docker recreates its bridges, and pointing a container at the
host's **public** IP never works at all on AWS — EC2 does not hairpin traffic
back to its own elastic IP, so the connection leaves through the internet
gateway and never returns. Container names have neither problem.

### Prerequisites

- The Chatwoot stack is up and owns the `chatwoot_default` network.
- Evolution API is up and its instance is linked (`state: open`).
- Docker with Compose v2 (`docker compose`). On older installs the command is
  `docker-compose`, with a hyphen.

### Start it

```bash
git clone <this-repo> aimanagement && cd aimanagement

cp bot/.env.example bot/.env
nano bot/.env                       # DeepSeek key, Chatwoot token, handoff target

mkdir -p bot/data
cp bot/instrucciones.txt bot/data/  # the panel edits this copy

docker compose up -d --build
docker compose logs -f ai-bot
```

A healthy boot prints the RAG line, `⚡ Redis conectado`, the port, the prompt
size, and the Chatwoot reachability check. Anything with 🚨 in it names its own
fix.

### Wiring Chatwoot to the container

The bot now answers at `ai-bot:5000` instead of a host IP, so Chatwoot's
AgentBot has to be told:

```bash
sudo docker exec chatwoot-rails-1 bundle exec rails runner "
  bot = AgentBot.first
  bot.update!(outgoing_url: 'http://ai-bot:5000/webhook')
  puts 'Updated: ' + bot.outgoing_url
"
```

Sidekiq re-reads that value from the database; no restart needed.

And Evolution must reach Chatwoot by name too — worth checking, since a stale
value here silently blocks every outgoing message:

```bash
curl -s http://localhost:8080/chatwoot/find/ventas -H "apikey: $EVOLUTION_API_KEY"
# "url" should be http://chatwoot-rails-1:3000, and "conversationPending" true
```

`docs/06-troubleshooting.md` has the full recipe for changing it — `POST
/chatwoot/set` replaces the whole object and rejects the nulls that
`/chatwoot/find` returns, so it needs a read-clean-resend cycle.

### Verify

```bash
docker compose ps                                   # both containers healthy
docker compose exec ai-bot node diagnostico.mjs     # every hop, one verdict
```

### One trade-off to know about

The panel's **Restart** button and **Logs** page drive the bot through PM2:
`pm2 jlist`, `pm2 restart`, `pm2 flush`, and PM2's log file paths. Running the
bot in Docker means PM2 no longer knows about it, and those two panel features
stop working — everything else in the panel is unaffected.

Pick whichever matches how you operate:

- **Bot under PM2** (`docs/05-operaciones.md`) — the panel is fully functional.
- **Bot under Docker** — reproducible builds and no host Node.js, but restart
  and logs move to `docker compose restart ai-bot` and `docker compose logs`.

Teaching the middleware to speak `docker` as well as `pm2` is a contained change
in `server/src/lib/pm2.js`; it just has not been made yet.

### The middleware stays on the host, on purpose

[`server/`](server/) is deliberately not containerized. Its entire job is to
reach things that live on the host — the bot's files, the PM2 daemon, log paths.
Putting it in a container would mean mounting the Docker socket and the host
filesystem into a service that is exposed to the internet, which trades a real
security boundary for a cosmetic consistency. See
[`server/README.md`](server/README.md).

---

## Running the bot without Docker

```bash
cd /home/ubuntu/api
npm install --omit=dev
cp .env.example .env && nano .env
pm2 start index.js --name ai-bot && pm2 save
```

`docs/05-operaciones.md` covers deployment, restarts, and health verification.

---

## Admin panel and middleware

```bash
cd panel && npm install
cp .env.example .env.local        # Supabase keys, AGENT_API_URL, AGENT_API_KEY
npm run dev
```

The panel reaches the server only through the middleware:

```bash
cd server && npm install --omit=dev
cp .env.example .env              # includes PANEL_API_KEY — see below
pm2 start ecosystem.config.cjs && pm2 save
```

`PANEL_API_KEY` is a shared secret with Vercel's `AGENT_API_KEY`, generated with
`openssl rand -hex 32`. **The middleware refuses to start without it**, which is
deliberate: a service that will not boot is a visible failure, whereas one
listening without authentication is an invisible one. Put TLS in front of it
before exposing it — that key travels on every request.

---

## When messages stop being delivered

```bash
docker compose exec ai-bot node diagnostico.mjs
```

It tests each hop of the outbound path separately — bot → Chatwoot → Evolution →
WhatsApp — and prints a verdict instead of a wall of output. It probes the usual
Docker gateways when `CHATWOOT_BASE_URL` is dead and tells you which address
actually answers; it flags a public IP configured in Evolution; and it validates
the Chatwoot token by posting a **private note**, which exercises the exact
endpoint, token, and conversation a real reply would use without sending
anything to the customer.

`docs/06-troubleshooting.md` documents each verdict and its fix.

---

## Documentation

| Document | Contents |
|----------|----------|
| [01 — Arquitectura](docs/01-arquitectura.md) | Diagram, server, component layout |
| [02 — Red y puertos](docs/02-red-y-puertos.md) | AWS security group, ports, Docker networks |
| [03 — Servicios](docs/03-servicios.md) | Bot, Chatwoot, Evolution, Redis and their APIs |
| [04 — Flujo de mensaje](docs/04-flujo-mensaje.md) | End-to-end path of a message |
| [05 — Operaciones](docs/05-operaciones.md) | Runbook: deploy, restart, health checks |
| [06 — Troubleshooting](docs/06-troubleshooting.md) | Known failures and their fixes |
| [07 — Panel](docs/07-panel.md) | Panel and middleware specification |
| [08 — Seguridad](docs/08-seguridad.md) | Credential inventory, rotation, exposure |
| [09 — Conocimiento](docs/09-conocimiento.md) | Vector knowledge base: setup and diagnosis |

---

## Credentials

This repository contains **no secrets**. Credential tables use placeholders
(`<EVOLUTION_API_KEY>`, `<CHATWOOT_BOT_TOKEN>`, …), and every `.env` is ignored
by git — only the `.env.example` templates are tracked.

Real values live in `bot/.env` on the server and in Chatwoot's database.
[`docs/08-seguridad.md`](docs/08-seguridad.md) explains how to retrieve and
rotate each one.
