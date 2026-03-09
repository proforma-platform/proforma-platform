export type ChatTranscriptionLanguageId = "pt-BR" | "en";

export interface ChatTranscriptionLanguageOption {
  id: ChatTranscriptionLanguageId;
  label: string;
  apiCode: string;
}

export const CHAT_TRANSCRIPTION_LANGUAGES: ChatTranscriptionLanguageOption[] = [
  { id: "pt-BR", label: "Português (Brasil)", apiCode: "pt" },
  { id: "en", label: "English", apiCode: "en" }
];

export const DEFAULT_CHAT_TRANSCRIPTION_LANGUAGE: ChatTranscriptionLanguageId = "pt-BR";

export const CHAT_TRANSCRIPTION_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_TRANSCRIPTION_MAX_DURATION_SEC = 180;

export function findChatTranscriptionLanguage(raw: unknown): ChatTranscriptionLanguageOption {
  const normalized = String(raw || "").trim();
  return CHAT_TRANSCRIPTION_LANGUAGES.find((item) => item.id === normalized) || {
    id: DEFAULT_CHAT_TRANSCRIPTION_LANGUAGE,
    label: "Português (Brasil)",
    apiCode: "pt"
  };
}

export function clampTranscriptionDurationSeconds(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(CHAT_TRANSCRIPTION_MAX_DURATION_SEC, Math.round(num));
}
