# AI Management — Panel

Panel de administración del bot de WhatsApp "Marcos". Permite ver el estado del
sistema, editar el prompt, revisar logs y ajustar variables de entorno sin
entrar por SSH.

Next.js 16 (App Router) · React 19 · Tailwind v4 · Supabase · shadcn/ui

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # rellenar con los valores reales
npm run dev
```

| Variable | Para qué |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto de Supabase (autenticación) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima; pública por diseño |
| `AGENT_API_URL` | Middleware del servidor AWS (puerto 5001) |
| `AGENT_API_KEY` | Clave compartida con ese middleware |

> `AGENT_API_KEY` **no** lleva el prefijo `NEXT_PUBLIC_`: así nunca entra en el
> bundle del navegador. Solo la leen los route handlers del servidor.

### Sin el middleware del servidor

`AGENT_API_URL` y `AGENT_API_KEY` apuntan a un servicio que **todavía no
existe**. Sin él la aplicación arranca y autentica correctamente, pero cada
página muestra el aviso "Sin conexión con el servidor". Su especificación está
en [`../docs/07-panel.md`](../docs/07-panel.md).

---

## Estructura

```
src/
├── app/
│   ├── (app)/          # Shell autenticado
│   │   ├── page.tsx            # Dashboard
│   │   ├── training/           # Editor del prompt + historial
│   │   ├── connections/        # Servicios, WhatsApp, memoria en Redis
│   │   ├── logs/               # Visor de logs de PM2
│   │   └── settings/           # Variables de entorno + reinicio
│   ├── login/          # Autenticación
│   └── api/            # Route handlers hacia el middleware del servidor
├── components/ui/      # Componentes shadcn/ui
├── hooks/              # useAgentData: lectura con sondeo
├── lib/                # Clientes de Supabase, cliente del servidor, tipos
└── proxy.ts            # Refresco de sesión y protección de rutas
```

### Autenticación

`src/proxy.ts` (la convención sucesora de `middleware` en Next.js 16) refresca
el token en cada petición y redirige a `/login` al tráfico sin sesión. Los route
handlers vuelven a comprobar la sesión con `requireUser()`: hablan con la
infraestructura usando la API key, así que no dependen de una sola capa.

### Sistema de diseño

Dark-only sobre `#0a0a0a`. La jerarquía la da un borde de 1px, no una sombra;
las esquinas son vivas y la paleta es monocromática. El verde está reservado al
estado "online" y nunca aparece sin su etiqueta de texto al lado, para no
depender de la percepción del color.

Los tokens viven en `src/app/globals.css`. `components.json` está configurado,
así que `npx shadcn@latest add <componente>` sigue funcionando; los componentes
añadidos necesitarán que se les quiten el radio y la sombra para encajar.

---

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de producción
npm run lint    # ESLint
```
