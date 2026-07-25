-- Base de conocimiento vectorial para el bot.
--
-- Ejecutar en Supabase → SQL Editor → New query. Es idempotente: se puede
-- volver a lanzar sin romper nada.

-- 1. Extensión pgvector -------------------------------------------------------

-- Supabase instala las extensiones en el esquema `extensions`. Se crea por si
-- acaso: en un Postgres limpio no existe.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- El tipo se referencia SIN cualificar y se resuelve por search_path. Si en tu
-- proyecto pgvector ya estaba instalado en otro esquema (algunos lo tienen en
-- `public`), cualificarlo como `extensions.vector` fallaría; así funciona en
-- ambos casos.
set search_path = public, extensions;

-- 2. Tabla --------------------------------------------------------------------
--
-- La dimensión 1536 corresponde a text-embedding-3-small de OpenAI. Cambiar de
-- modelo obliga a recrear la columna y a regenerar todos los embeddings: los
-- vectores de modelos distintos no son comparables entre sí.

create table if not exists public.knowledge_snippets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(trim(title)) between 1 and 200),
  content     text not null check (char_length(trim(content)) between 1 and 8000),
  embedding   vector(1536),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.knowledge_snippets is
  'Fragmentos de conocimiento que el bot inyecta en su system prompt.';
comment on column public.knowledge_snippets.embedding is
  'text-embedding-3-small (1536 dim). Nulo mientras no se haya generado.';

-- 3. Índice vectorial ---------------------------------------------------------
--
-- HNSW en lugar de IVFFlat: no necesita entrenamiento previo ni un número
-- mínimo de filas para dar buenos resultados, lo que importa cuando la tabla
-- empieza con diez fragmentos y no con cien mil.
--
-- vector_cosine_ops porque los embeddings de OpenAI vienen normalizados y la
-- similitud coseno es la métrica que corresponde.

create index if not exists knowledge_snippets_embedding_idx
  on public.knowledge_snippets
  using hnsw (embedding vector_cosine_ops);

create index if not exists knowledge_snippets_created_at_idx
  on public.knowledge_snippets (created_at desc);

-- 4. updated_at automático ----------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_snippets_touch on public.knowledge_snippets;
create trigger knowledge_snippets_touch
  before update on public.knowledge_snippets
  for each row execute function public.touch_updated_at();

-- 5. Búsqueda por similitud ---------------------------------------------------
--
-- El operador <=> es la distancia coseno: 0 = idéntico, 2 = opuesto. Se
-- devuelve como similitud (1 - distancia) porque es más intuitivo de leer y de
-- umbralizar desde el cliente.
--
-- Los fragmentos sin embedding se excluyen: no son comparables y colarían
-- ruido en los resultados.

create or replace function public.match_snippets(
  query_embedding vector(1536),
  match_count     int   default 3,
  match_threshold float default 0.3
)
returns table (
  id         uuid,
  title      text,
  content    text,
  similarity float
)
language sql
stable
-- search_path fijo: sin esto, una función SECURITY DEFINER puede ser secuestrada
-- resolviendo nombres contra un esquema que controle quien la llama.
set search_path = public, extensions
as $$
  select
    s.id,
    s.title,
    s.content,
    1 - (s.embedding <=> query_embedding) as similarity
  from public.knowledge_snippets s
  where s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) > match_threshold
  order by s.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

-- 6. Seguridad ----------------------------------------------------------------
--
-- RLS activo y sin política para anon: la clave anónima viaja en el navegador,
-- así que sin esto cualquiera podría leer y reescribir el conocimiento del bot.
--
-- El bot no usa la clave anónima: se conecta con la service_role, que salta RLS
-- por diseño y nunca sale del servidor.

alter table public.knowledge_snippets enable row level security;

drop policy if exists "usuarios autenticados gestionan el conocimiento"
  on public.knowledge_snippets;

create policy "usuarios autenticados gestionan el conocimiento"
  on public.knowledge_snippets
  for all
  to authenticated
  using (true)
  with check (true);

-- Permisos de tabla explícitos.
--
-- Supabase concede privilegios por defecto a anon/authenticated/service_role
-- sobre las tablas nuevas de `public`, pero dejarlo implícito significa que la
-- seguridad depende de una configuración que no está a la vista. Aquí se
-- declara: `anon` no recibe NADA, así que queda bloqueado por permisos además
-- de por RLS — dos barreras en vez de una.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.knowledge_snippets to authenticated;
grant all privileges on public.knowledge_snippets to service_role;
revoke all on public.knowledge_snippets from anon;

-- match_snippets la invoca el bot con service_role; se revoca al resto para que
-- no quede expuesta a través de la API pública.
revoke execute on function public.match_snippets(vector, int, float) from anon;
grant  execute on function public.match_snippets(vector, int, float) to authenticated, service_role;
