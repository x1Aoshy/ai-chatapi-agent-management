/**
 * Contrato entre el panel y el middleware del servidor AWS.
 *
 * El middleware todavía no existe (ver docs/07-panel.md). Estos tipos son la
 * especificación que el panel espera: al implementarlo, esta es la forma que
 * deben tener las respuestas.
 */

export type ServiceStatus = "online" | "offline" | "degraded" | "unknown";

export interface ServiceHealth {
  id: "bot" | "chatwoot" | "whatsapp" | "redis" | "deepseek";
  name: string;
  status: ServiceStatus;
  /** Texto corto para la UI: "state: open", "401 Unauthorized", etc. */
  detail?: string;
  latencyMs?: number;
}

export interface BotProcess {
  status: "online" | "stopped" | "errored" | "unknown";
  /** Milisegundos desde el último arranque. */
  uptimeMs?: number;
  restarts?: number;
  memoryMb?: number;
  cpuPercent?: number;
  model?: string;
}

export interface HealthResponse {
  services: ServiceHealth[];
  bot: BotProcess;
  /** ISO 8601. */
  checkedAt: string;
}

export interface InstructionsResponse {
  content: string;
  /** ISO 8601 de la última modificación del archivo. */
  updatedAt?: string;
  bytes?: number;
}

export interface InstructionVersion {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  bytes: number;
  author?: string;
}

/**
 * Variable de entorno tal y como la expone el middleware.
 *
 * `value` llega enmascarado cuando `secret` es true: el middleware nunca
 * devuelve una API key en claro, solo un prefijo/sufijo para reconocerla.
 */
export interface EnvVar {
  key: string;
  value: string;
  secret: boolean;
  isSet: boolean;
  /** Si es false, el panel muestra la variable en solo lectura. */
  editable: boolean;
}

export interface WhatsAppState {
  instance: string;
  state: "open" | "close" | "connecting" | "unknown";
}

export interface WhatsAppQr {
  /** data:image/png;base64,... */
  base64: string;
}

export interface LogLine {
  /** ISO 8601 si el middleware consigue parsearlo del log. */
  timestamp?: string;
  stream: "out" | "err";
  message: string;
}

export interface LogsResponse {
  lines: LogLine[];
}

export interface ConversationMemory {
  conversationId: string;
  /** Número de mensajes guardados (máx. 6). */
  messages: number;
  /** Segundos restantes de TTL. */
  ttlSeconds: number;
  preview?: string;
}

export interface ConversationsResponse {
  conversations: ConversationMemory[];
}
