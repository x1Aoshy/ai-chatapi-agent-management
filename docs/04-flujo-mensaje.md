# 04 — Flujo de un mensaje (punta a punta)

## Recorrido completo

```
1. Cliente envía "Hola" por WhatsApp
       ↓
2. Evolution API (puerto 8080) recibe el mensaje
       ↓
3. Evolution API lo reenvía a Chatwoot (puerto 3000) vía webhook interno
       ↓
4. Chatwoot crea la conversación en estado "Pendiente" (conversationPending: true)
       ↓
5. Chatwoot Sidekiq detecta que hay un AgentBot activo en esa Inbox
       ↓
6. Sidekiq ejecuta AgentBots::WebhookJob enviando POST a
   http://172.18.0.1:5000/webhook
       ↓
7. El bot Node.js (index.js) recibe el payload
       ↓
8. Consulta Redis para obtener el historial de conversación
       ↓
9. Envía prompt de sistema + historial + mensaje nuevo a DeepSeek API
       ↓
10. Recibe la respuesta de la IA
       ↓
11. Si contiene [HUMAN_HANDOFF]:
    → Envía mensaje de transferencia vía Chatwoot API
    → Cambia el estado de la conversación a "open" (PATCH)
    → Limpia el historial de Redis
       ↓
12. Si NO contiene [HUMAN_HANDOFF]:
    → Guarda el turno en Redis (máx. 6 mensajes, TTL 24 h)
    → Envía la respuesta vía Chatwoot API (POST message)
       ↓
13. Chatwoot recibe la respuesta y la reenvía a Evolution API
       ↓
14. Evolution API envía el mensaje de vuelta al WhatsApp del cliente
```

---

## Eventos que procesa el bot

| Evento | Condición | Acción |
|--------|-----------|--------|
| `message_created` | `message_type == "incoming"` y hay `content` | Genera respuesta |
| `conversation_status_changed` | estado nuevo `resolved` | Borra `chat_history:{id}` |
| `conversation_resolved` | estado nuevo `resolved` | Borra `chat_history:{id}` |
| Cualquier otro | — | Se ignora |

Los mensajes salientes (`outgoing`) se descartan explícitamente. Sin ese filtro el
bot se respondería a sí mismo en bucle, ya que sus propias respuestas también
generan un evento `message_created`.

---

## Rutas de escalado a humano

Hay dos caminos, y difieren en si consultan al modelo:

**Atajo directo.** El mensaje coincide con `/^agente[s]?$/i`. El bot transfiere sin
llamar a DeepSeek — más rápido y no gasta cuota. Es la vía que se le indica al
cliente en las respuestas de rechazo del prompt.

**Decisión del modelo.** El prompt instruye a Marcos a responder únicamente
`[HUMAN_HANDOFF]` cuando el cliente pide una persona real o pregunta algo médico.
El bot detecta ese marcador en la respuesta y escala.

Ambas rutas hacen exactamente lo mismo a continuación:

1. `POST` del mensaje *"Te comunico con uno de nuestros asesores. Dame un momento."*
2. `PATCH` de la conversación a `status: "open"` → sale de la cola del bot.
3. `POST /assignments` → se asigna al agente o equipo de
   `CHATWOOT_HANDOFF_ASSIGNEE_ID` / `CHATWOOT_HANDOFF_TEAM_ID`.
4. `DEL chat_history:{conversationId}` → el agente humano empieza sin contexto de IA.

El paso 3 no es opcional en la práctica: sin él la conversación queda en "Sin
asignar", que no es la vista que mira un agente por defecto. Un fallo ahí se
registra pero no revierte el paso 2 — que el bot deje de responder a quien pidió
un humano importa más que quién la tenga asignada.

---

## Ciclo de vida de la memoria

```
Mensaje 1  →  history = []                    →  IA ve: [system, user]
              guarda [u1, a1]

Mensaje 2  →  history = [u1, a1]              →  IA ve: [system, u1, a1, user]
              guarda [u1, a1, u2, a2]

Mensaje 3  →  history = [u1, a1, u2, a2]      →  IA ve: [system, u1, a1, u2, a2, user]
              guarda [u1, a1, u2, a2, u3, a3]

Mensaje 4  →  history = [u1..a3]              →  IA ve: [system, u1..a3, user]
              guarda slice(-6) = [u2, a2, u3, a3, u4, a4]   ← u1/a1 se descartan
```

La ventana es de **6 mensajes = 3 turnos**. A partir del cuarto turno, el más
antiguo cae. Con `max_tokens: 300` por respuesta, el contexto enviado a DeepSeek
se mantiene acotado y predecible.

El TTL de 24 h se **renueva en cada escritura**, así que una conversación activa
nunca expira a media charla; expira 24 h después del último mensaje.

### Cuándo se pierde la memoria

- La conversación se marca como `resolved` en Chatwoot.
- Se produce un escalado a humano (por cualquiera de las dos rutas).
- Pasan 24 h sin actividad.
- Redis se reinicia o no está disponible.

---

## Puntos de fallo del recorrido

| Paso | Si falla | Síntoma visible |
|------|----------|-----------------|
| 2 | Sesión de WhatsApp caída | `state: "close"`; no entra ningún mensaje |
| 3–4 | `conversationPending: false` | Llegan mensajes a Chatwoot pero el bot no reacciona |
| 5–6 | Sidekiq caído o `outgoing_url` errónea | *"Conversation marked open due to error with agent bot"* |
| 7 | Bot caído o puerto 5000 cerrado | Mismo mensaje de error en Chatwoot |
| 8 | Redis caído | El bot responde, pero se presenta en cada mensaje |
| 9 | Modelo inválido o cuota agotada | Error en `pm2 logs`; el cliente no recibe respuesta |
| 12–13 | Token de Chatwoot desincronizado | `401` en `pm2 logs`; la IA responde pero nada llega |

El diagnóstico detallado de cada uno está en `06-troubleshooting.md`.
