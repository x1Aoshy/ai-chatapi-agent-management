# 05 — Operaciones (runbook)

## Verificación de salud

Los cuatro deben pasar antes de dar el sistema por operativo:

```bash
# 1. Bot en línea
pm2 status
# ai-bot debe aparecer como "online" con restarts estables

# 2. Redis responde
redis-cli -h 127.0.0.1 ping
# → PONG

# 3. Contenedores arriba
sudo docker ps --format '{{.Names}}\t{{.Status}}'
# chatwoot-rails-1, chatwoot-sidekiq-1, postgres, redis, evolution

# 4. WhatsApp conectado
curl -s "http://localhost:8080/instance/connectionState/ventas" \
  -H "apikey: $EVOLUTION_API_KEY"
# → {"instance":{"instanceName":"ventas","state":"open"}}
```

### Prueba de humo completa

Envía un mensaje real desde un WhatsApp que no sea el vinculado y observa
simultáneamente:

```bash
pm2 logs ai-bot --lines 0    # deja corriendo
```

Deberías ver `[📥 CLIENTE]`, luego `[🤖 MARCOS]`, luego `📤 Mensaje enviado`.
Si falta alguno de los tres, la tabla de `04-flujo-mensaje.md` indica dónde se cortó.

---

## Modificar el comportamiento del bot

Editar el prompt es la operación más frecuente y **no requiere reiniciar**:
`index.js` lee `instrucciones.txt` en cada mensaje entrante.

```bash
cd /home/ubuntu/api
cp instrucciones.txt "instrucciones.txt.bak.$(date +%Y%m%d-%H%M%S)"
nano instrucciones.txt
# El siguiente mensaje ya usa la versión nueva
```

> La lectura por mensaje tiene un coste: una E/S de disco síncrona en el camino
> caliente y, si el archivo queda a medio escribir, el bot puede leerlo incompleto.
> Con este volumen es irrelevante, pero es lo primero que hay que cachear si el
> tráfico crece. Escribir con `mv` de un temporal (renombrado atómico) en vez de
> editar en sitio elimina el riesgo de lectura parcial.

Haz siempre una copia antes de editar: no hay historial de versiones hasta que el
el panel lo implemente (ver `07-panel.md`).

---

## Modificar variables de entorno

```bash
cd /home/ubuntu/api
cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
nano .env
pm2 restart ai-bot --update-env     # ← --update-env es obligatorio
pm2 logs ai-bot --lines 20          # confirmar arranque limpio
```

Sin `--update-env`, PM2 conserva el entorno del arranque anterior y el cambio
parece no surtir efecto.

---

## Desplegar cambios en `index.js`

```bash
cd /home/ubuntu/api
cp index.js "index.js.bak.$(date +%Y%m%d-%H%M%S)"
# ... aplicar cambios ...
node --check index.js               # validar sintaxis ANTES de reiniciar
pm2 restart ai-bot
pm2 logs ai-bot --lines 30
```

`node --check` evita el caso peor: un error de sintaxis deja a `ai-bot` en bucle de
reinicio y el bot queda mudo hasta que alguien lo note.

Para volver atrás:

```bash
cp index.js.bak.<timestamp> index.js && pm2 restart ai-bot
```

---

## Reinicios

```bash
# Solo el bot
pm2 restart ai-bot --update-env

# Chatwoot completo (⚠️ corta el servicio ~1-2 min)
cd <ruta-del-compose-de-chatwoot>
sudo docker compose restart

# Solo Sidekiq (si los webhooks no se disparan)
sudo docker restart chatwoot-sidekiq-1
```

Tras cualquier reinicio de Docker, **verifica las gateways** — pueden haber
cambiado y romper la comunicación en ambos sentidos:

```bash
sudo docker exec chatwoot-rails-1 ip route show | grep default
```

Ver `06-troubleshooting.md` → "Docker cambia IP interna al reiniciar".

---

## Persistencia de PM2 tras reinicio del servidor

```bash
pm2 save                    # guardar la lista de procesos actual
pm2 startup                 # generar el script de arranque (ejecutar lo que imprima)
```

Sin esto, el bot **no vuelve solo** después de un reboot de la EC2.

---

## Logs

```bash
pm2 logs ai-bot --lines 100          # bot, últimas 100 líneas
pm2 logs ai-bot --err                # solo errores
pm2 flush ai-bot                     # vaciar logs (liberar disco)

sudo docker logs chatwoot-rails-1 --tail 50
sudo docker logs chatwoot-sidekiq-1 --tail 50
```

Los logs de PM2 crecen sin límite por defecto. En un disco pequeño conviene
`pm2 install pm2-logrotate` para no quedarse sin espacio.

---

## Rutina de mantenimiento sugerida

| Frecuencia | Tarea |
|------------|-------|
| Diaria | Verificar `state: "open"` de WhatsApp |
| Semanal | Revisar `pm2 status` (contador de restarts), espacio en disco (`df -h`), memoria (`free -h`) |
| Mensual | Rotar tokens (`08-seguridad.md`), revisar copias de `instrucciones.txt` |
| Tras cada reboot | `pm2 status`, gateways de Docker, prueba de humo |
