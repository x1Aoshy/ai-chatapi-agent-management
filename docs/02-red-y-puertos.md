# 02 — Red y puertos

## Security Group de AWS

| Puerto | Servicio | Acceso | Notas |
|--------|----------|--------|-------|
| 22 | SSH | Público | Debería restringirse a IPs conocidas |
| 80 | HTTP | Público | |
| 443 | HTTPS | Público | |
| 3000 | Chatwoot (panel web) | Público | Sirve sobre HTTP plano |
| 3333 | QR de WhatsApp | Público | **Temporal** — cerrar tras vincular |
| 5000 | Bot IA (webhook) | Público | Solo necesita tráfico interno |
| 8080 | Evolution API | Solo interno (Docker) | |
| 6379 | Redis | Solo local (`127.0.0.1`) | |

---

## Observaciones de exposición

Tres puertos están abiertos a Internet con más alcance del que necesitan. Ninguno
rompe nada hoy, pero conviene tenerlos presentes:

**Puerto 5000 (bot).** El webhook del bot solo recibe tráfico de Sidekiq, que corre
en la misma máquina. No hay razón para que sea público. Además, `POST /webhook` no
valida ninguna firma ni token: cualquiera que alcance el puerto puede inyectar un
payload falso y hacer que el bot escriba en una conversación de Chatwoot o consuma
cuota de DeepSeek. Restringirlo en el Security Group cierra el problema sin tocar
código.

**Puerto 3333 (QR).** Se abre para vincular WhatsApp y debería cerrarse en cuanto
la instancia queda en `state: open`. Un QR expuesto es una sesión de WhatsApp
regalada.

**Puerto 3000 (Chatwoot).** Sirve la interfaz de administración sobre HTTP sin TLS.
Las credenciales de los agentes viajan en claro. Poner un reverse proxy con
certificado (Caddy o Nginx + Let's Encrypt) en 443 y cerrar el 3000 es la solución
estándar.

Ver `08-seguridad.md` para el detalle completo.

---

## Redes Docker

| Red | Gateway | Quién la usa |
|-----|---------|--------------|
| `docker0` (bridge por defecto) | `172.17.0.1` | Bot → Chatwoot |
| Red del compose de Chatwoot | `172.18.0.1` | Chatwoot/Sidekiq → Bot |

Desde el punto de vista del bot (que corre en el host), `172.17.0.1:3000` es
Chatwoot. Desde el punto de vista de un contenedor de Chatwoot, `172.18.0.1:5000`
es el bot corriendo en el host.

### Verificar las gateways vigentes

```bash
# Gateway que ve el contenedor de Rails
sudo docker exec chatwoot-rails-1 ip route show | grep default

# Redes y subredes definidas
sudo docker network ls
sudo docker network inspect bridge | grep -i gateway
```

Si Docker recrea sus redes (reinicio del daemon, `docker compose down`, cambio de
subred), estas IPs cambian y hay que actualizar dos sitios:

1. `CHATWOOT_BASE_URL` en `/home/ubuntu/api/.env` — y reiniciar el bot con
   `pm2 restart ai-bot --update-env`.
2. `outgoing_url` del AgentBot en la base de datos de Chatwoot — ver
   `03-servicios.md`.

---

## Puertos internos usados por el bot

| Destino | URL | Uso |
|---------|-----|-----|
| Chatwoot API | `http://172.17.0.1:3000` | Enviar mensajes, cambiar estado |
| Redis | `redis://127.0.0.1:6379` | Historial de conversación |
| DeepSeek | `https://api.deepseek.com` | Inferencia (salida a Internet) |
