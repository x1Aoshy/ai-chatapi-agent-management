# 09 — Base de conocimiento (RAG)

El bot ya no depende solo de `instrucciones.txt`. Antes de responder busca
fragmentos relevantes en una base vectorial y los inyecta en su prompt.

`instrucciones.txt` **no desaparece**: sigue definiendo quién es Marcos, su tono
y sus reglas. El conocimiento es lo que cambia a menudo —horarios, promociones,
políticas— y no debería obligar a reescribir la personalidad del bot.

---

## Recorrido de un mensaje con RAG

```
Cliente escribe "¿a qué hora abren?"
       ↓
Bot genera el embedding del mensaje (OpenAI, text-embedding-3-small)
       ↓
Supabase: match_snippets(vector, 3, 0.3)
       ↓
Los 3 fragmentos más similares por encima del umbral
       ↓
System prompt = instrucciones.txt + bloque de CONTEXTO
       ↓
DeepSeek responde con esa información a la vista
```

**Si algo de esto falla, el bot responde igual**, solo que sin contexto. Está
así a propósito: un fallo del RAG no puede dejar a un cliente sin respuesta en
WhatsApp. Cada paso devuelve vacío en lugar de lanzar.

---

## Puesta en marcha

### 1. Ejecutar el SQL

Supabase → SQL Editor → New query → pegar
[`supabase/migrations/0001_knowledge_base.sql`](../supabase/migrations/0001_knowledge_base.sql)
y ejecutar. Es idempotente: se puede relanzar sin romper nada.

Crea la extensión `vector`, la tabla `knowledge_snippets`, un índice HNSW, la
función `match_snippets`, y las políticas y permisos.

### 2. Variables de entorno

**Panel (Vercel)** — genera los embeddings al guardar:

```
EMBEDDING_PROVIDER=openai      # o "gemini"
OPENAI_API_KEY=sk-...          # solo si el proveedor es openai
GEMINI_API_KEY=...             # solo si el proveedor es gemini
```

**Bot (`/home/ubuntu/api/.env`)** — busca en cada mensaje:

```
EMBEDDING_PROVIDER=openai      # el MISMO que en el panel
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Luego `pm2 restart ai-bot --update-env`. En el arranque, el log dice
`🧠 RAG activo` o `🧠 RAG inactivo` con lo que falta.

> El bot usa la **service_role key**, no la anónima: necesita saltarse RLS para
> leer sin sesión de usuario. Esa clave da acceso total a la base de datos y no
> debe salir del servidor jamás.

### 3. Añadir conocimiento

En el panel, Entrenamiento → pestaña Conocimiento. Al guardar se genera el vector; sin él el fragmento
existe pero el bot no puede encontrarlo.

---

## Decisiones

**Dos proveedores de embeddings.** DeepSeek no publica API de embeddings, así
que los vectores vienen de otro sitio aunque la inferencia siga en DeepSeek:

| Proveedor | Modelo | Dim. | Coste |
|-----------|--------|------|-------|
| `openai` | `text-embedding-3-small` | 1536 | $0.02 / millón de tokens |
| `gemini` | `text-embedding-004` | 768 | Nivel gratuito |

A modo de referencia: 1000 mensajes al día rondan los 20 000 tokens diarios, es
decir unos **$0.012 al mes** con OpenAI. El mínimo de recarga son $5 y duran
años. Gemini evita el desembolso inicial a cambio de depender de un tercer
proveedor y de sus cuotas.

Gemini devuelve 768 dimensiones y se rellenan con ceros hasta 1536, la
dimensión de la columna. No distorsiona nada: en similitud coseno los ceros no
aportan ni al producto escalar ni a las normas, así que la similitud entre dos
vectores rellenados es exactamente la misma que entre los originales. Permite
cambiar de proveedor sin migrar la base.

> **Cambiar de proveedor obliga a regenerar todos los fragmentos.** Los
> vectores de modelos distintos no son comparables, y mezclarlos produce
> búsquedas incorrectas **sin ningún error visible**. Tras el cambio hay que
> reeditar y guardar cada fragmento desde el panel.

**HNSW en lugar de IVFFlat.** IVFFlat necesita entrenarse sobre datos ya
existentes y rinde mal con pocas filas. Esta tabla empieza con diez fragmentos,
no con cien mil.

**Umbral de similitud 0.3.** Por debajo, el fragmento habla de otra cosa.
Meterlo igualmente es peor que no meter nada: empuja al modelo a responder con
material irrelevante en lugar de admitir que no sabe.

**Tres fragmentos por mensaje.** Suficiente para cubrir una pregunta con
matices, sin inflar el prompt. Cada fragmento son tokens que se pagan en cada
mensaje.

**El embedding se genera antes de insertar.** Si se hiciera después, un fallo de
OpenAI dejaría el fragmento guardado pero invisible para el bot, sin nada en la
interfaz que lo delatara.

**Se reindexa en cada edición**, aunque solo cambie una coma. Comparar el texto
para decidir si hace falta sería una optimización con un modo de fallo caro: si
la comparación se equivoca, el fragmento queda indexado por un contenido que ya
no existe.

---

## Escribir buenos fragmentos

**Un fragmento, una idea.** La búsqueda es por similitud semántica: un fragmento
que mezcla horarios, envíos y devoluciones se parece poco a cada una de esas
preguntas por separado, y acaba sin salir para ninguna.

**Redacta como se pregunta.** "Abrimos de lunes a sábado de 9:00 a 20:00" casa
mejor con "¿a qué hora abren?" que un "HORARIO COMERCIAL: L-S 9-20".

**El título cuenta.** Se incluye en el texto que se vectoriza, así que aporta
contexto a la búsqueda.

---

## Diagnóstico

En `pm2 logs ai-bot`, cuando el RAG encuentra algo:

```
[🧠 CONTEXTO] Horario de atención (0.82), Política de envíos (0.41)
```

El número es la similitud. Si un fragmento que esperabas no aparece, o sale con
un valor bajo, suele ser que mezcla varios temas: divídelo.

| Síntoma | Causa probable |
|---------|----------------|
| `🧠 RAG inactivo` al arrancar | Falta alguna de las tres variables en el `.env` del bot |
| Nunca aparece `[🧠 CONTEXTO]` | No hay fragmentos, o ninguno supera el umbral |
| `⚠️ Embedding falló` | API key de OpenAI inválida o sin saldo |
| `⚠️ Búsqueda de conocimiento falló` | Falta ejecutar el SQL, o la service_role key es incorrecta |
| Guardar da error en el panel | Falta `OPENAI_API_KEY` en Vercel |
