"use client";

import * as React from "react";
import { Download, RefreshCw, Search, Terminal, X } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { LastUpdated } from "@/components/last-updated";
import { NotConfigured } from "@/components/not-configured";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAgentData } from "@/hooks/use-agent-data";
import type { LogLine, LogsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 5_000;
const LINE_OPTIONS = [100, 200, 500] as const;

type StreamFilter = "all" | "err";

function formatTime(timestamp?: string) {
  if (!timestamp) return "--:--:--";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--:--:--";

  return date.toLocaleTimeString("es", { hour12: false });
}

/** Control segmentado: dos o tres opciones excluyentes sin abrir un desplegable. */
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-8 items-center border border-border"
    >
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-full px-2.5 text-xs transition-colors",
            index > 0 && "border-l border-border",
            option.value === value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function LogsViewer() {
  const [stream, setStream] = React.useState<StreamFilter>("all");
  const [lines, setLines] = React.useState<number>(200);
  const [live, setLive] = React.useState(true);
  const [query, setQuery] = React.useState("");

  const path = `/api/logs?lines=${lines}${stream === "err" ? "&stream=err" : ""}`;
  const logs = useAgentData<LogsResponse>(path, {
    pollMs: live ? LIVE_POLL_MS : undefined,
  });

  const scroller = React.useRef<HTMLDivElement>(null);
  /*
   * Anclaje al final. El visor solo salta abajo si el usuario ya estaba abajo:
   * si ha subido a leer algo, un log en vivo que le arrastre cada 5 segundos
   * hace la página inservible.
   */
  const stickToBottom = React.useRef(true);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;

    stickToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  const allLines = React.useMemo(() => logs.data?.lines ?? [], [logs.data]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allLines;

    return allLines.filter((line) =>
      line.message.toLowerCase().includes(needle)
    );
  }, [allLines, query]);

  React.useEffect(() => {
    if (!stickToBottom.current) return;

    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [visible]);

  function onDownload() {
    const body = visible
      .map(
        (line) =>
          `${line.timestamp ?? ""}\t${line.stream.toUpperCase()}\t${line.message}`
      )
      .join("\n");

    const url = URL.createObjectURL(
      new Blob([body], { type: "text/plain;charset=utf-8" })
    );
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `ai-bot-logs-${new Date().toISOString().slice(0, 19)}.txt`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  if (logs.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[28rem]" />
      </div>
    );
  }

  if (logs.error && !logs.data) {
    return (
      <NotConfigured
        error={logs.status === 503 ? null : logs.error}
        action={
          <Button variant="outline" size="sm" onClick={logs.refresh}>
            <RefreshCw
              className={cn("size-4", logs.refreshing && "animate-spin")}
            />
            Reintentar
          </Button>
        }
      />
    );
  }

  const errorCount = allLines.filter((line) => line.stream === "err").length;

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<StreamFilter>
          label="Flujo"
          value={stream}
          onChange={setStream}
          options={[
            { value: "all", label: "Todo" },
            { value: "err", label: "Solo errores" },
          ]}
        />

        <Segmented<number>
          label="Número de líneas"
          value={lines}
          onChange={setLines}
          options={LINE_OPTIONS.map((count) => ({
            value: count,
            label: String(count),
          }))}
        />

        <label className="flex h-8 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={live}
            onCheckedChange={setLive}
            aria-label="Seguimiento en vivo"
          />
          <span className="flex items-center gap-1.5">
            En vivo
            {live ? (
              <span
                aria-hidden="true"
                className="size-1.5 animate-blink bg-online"
              />
            ) : null}
          </span>
        </label>

        <div className="relative ml-auto flex h-8 min-w-56 flex-1 items-center border border-border sm:flex-none">
          <Search className="ml-2.5 size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar líneas…"
            aria-label="Filtrar líneas del log"
            className="h-full w-full bg-transparent px-2 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar el filtro"
              className="mr-1.5 flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={logs.refresh}
          disabled={logs.refreshing}
        >
          <RefreshCw
            className={cn("size-4", logs.refreshing && "animate-spin")}
          />
          Actualizar
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={visible.length === 0}
        >
          <Download className="size-4" />
          Descargar
        </Button>
      </div>

      {logs.error ? (
        <p className="border border-warning/30 bg-warning/5 px-4 py-2.5 text-xs text-warning">
          El último sondeo falló ({logs.error}). Se muestran las líneas de la
          lectura anterior.
        </p>
      ) : null}

      {/* Visor */}
      <Card className="ticked overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2">
          <p className="eyebrow flex items-center gap-2">
            <Terminal className="size-3.5" />
            pm2 logs ai-bot
          </p>
          <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>
              <span className="num text-foreground">{visible.length}</span>
              {query ? ` de ${allLines.length}` : ""} líneas
            </span>
            {errorCount > 0 ? (
              <span className="text-destructive">
                <span className="num">{errorCount}</span> en stderr
              </span>
            ) : null}
          </p>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Terminal}
            title={query ? "Ningún resultado" : "Sin líneas de log"}
            description={
              query
                ? `Nada coincide con "${query}" en las últimas ${allLines.length} líneas.`
                : "PM2 no ha devuelto salida para el proceso del bot. Puede que acabe de arrancar."
            }
          />
        ) : (
          <div
            ref={scroller}
            onScroll={onScroll}
            className="h-[28rem] overflow-auto bg-background lg:h-[32rem]"
          >
            <ol className="min-w-max">
              {visible.map((line, index) => (
                <LogRow key={index} line={line} index={index} />
              ))}
            </ol>
          </div>
        )}
      </Card>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <LastUpdated at={logs.updatedAt} stale={Boolean(logs.error)} />
        <span aria-hidden="true">·</span>
        <span>
          {live ? `sondeo cada ${LIVE_POLL_MS / 1000}s` : "seguimiento en pausa"}
        </span>
        <span aria-hidden="true">·</span>
        <span>el servidor conserva como mucho 500 líneas por petición</span>
      </p>
    </div>
  );
}

function LogRow({ line, index }: { line: LogLine; index: number }) {
  const isError = line.stream === "err";

  return (
    <li
      className={cn(
        "group flex gap-3 px-4 py-0.5 font-mono text-[11.5px] leading-5 transition-colors hover:bg-accent/40",
        isError && "bg-destructive/[0.04]"
      )}
    >
      <span className="w-8 shrink-0 select-none text-right text-muted-foreground/40 tabular-nums">
        {index + 1}
      </span>
      <span className="w-16 shrink-0 select-none tabular-nums text-muted-foreground">
        {formatTime(line.timestamp)}
      </span>
      <span
        className={cn(
          "w-8 shrink-0 select-none text-[10px] uppercase tracking-wider",
          isError ? "text-destructive" : "text-muted-foreground/50"
        )}
      >
        {isError ? "err" : "out"}
      </span>
      <span
        className={cn(
          "whitespace-pre-wrap break-all",
          isError ? "text-destructive" : "text-foreground/90"
        )}
      >
        {line.message || " "}
      </span>
    </li>
  );
}
