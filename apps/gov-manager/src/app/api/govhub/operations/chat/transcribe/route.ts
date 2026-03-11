import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../../auth/session";
import {
  CHAT_TRANSCRIPTION_MAX_BYTES,
  CHAT_TRANSCRIPTION_MAX_DURATION_SEC,
  findChatTranscriptionLanguage
} from "../../../../../../core/chat-transcription";

const TRANSCRIBE_API_URL = String(process.env.TRANSCRIBE_API_URL || "https://api.openai.com/v1/audio/transcriptions").trim();
const TRANSCRIBE_API_KEY = String(process.env.TRANSCRIBE_API_KEY || "").trim();
const TRANSCRIBE_API_MODEL = String(process.env.TRANSCRIBE_API_MODEL || "gpt-4o-mini-transcribe").trim();
const TRANSCRIBE_TIMEOUT_MS = Math.max(5_000, Number(process.env.TRANSCRIBE_TIMEOUT_MS || 60_000));

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

export async function POST(request: Request) {
  if (!hasSessionCookie(request)) {
    return json(401, { status: "unauthorized", error_code: "AUTH_REQUIRED" });
  }
  if (!TRANSCRIBE_API_URL || !TRANSCRIBE_API_KEY || !TRANSCRIBE_API_MODEL) {
    return json(503, { status: "misconfigured", error_code: "TRANSCRIBE_PROVIDER_REQUIRED" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { status: "invalid_request", error_code: "FORMDATA_REQUIRED" });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return json(400, { status: "invalid_request", error_code: "AUDIO_FILE_REQUIRED" });
  }

  if (audio.size <= 0 || audio.size > CHAT_TRANSCRIPTION_MAX_BYTES) {
    return json(413, {
      status: "invalid_request",
      error_code: "AUDIO_SIZE_EXCEEDED",
      max_bytes: CHAT_TRANSCRIPTION_MAX_BYTES
    });
  }

  const durationRaw = Number(form.get("duration_sec"));
  const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : 0;
  if (durationSec > CHAT_TRANSCRIPTION_MAX_DURATION_SEC) {
    return json(413, {
      status: "invalid_request",
      error_code: "AUDIO_DURATION_EXCEEDED",
      max_duration_sec: CHAT_TRANSCRIPTION_MAX_DURATION_SEC
    });
  }

  const language = findChatTranscriptionLanguage(form.get("language"));
  const upstreamBody = new FormData();
  const buffer = await audio.arrayBuffer();
  upstreamBody.set("file", new Blob([buffer], { type: audio.type || "audio/webm" }), audio.name || "chat-hub-recording.webm");
  upstreamBody.set("model", TRANSCRIBE_API_MODEL);
  upstreamBody.set("language", language.apiCode);
  upstreamBody.set("response_format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const response = await fetch(TRANSCRIBE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TRANSCRIBE_API_KEY}`
      },
      body: upstreamBody,
      cache: "no-store",
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    const text = String((payload as { text?: unknown }).text || "").trim();
    if (!response.ok) {
      return json(502, { status: "upstream_error", error_code: "TRANSCRIBE_UPSTREAM_FAILED" });
    }
    if (!text) {
      return json(502, { status: "upstream_error", error_code: "TRANSCRIBE_EMPTY_TEXT" });
    }

    return json(200, {
      status: "ok",
      text,
      language: language.id,
      duration_sec: durationSec,
      bytes: audio.size
    });
  } catch {
    return json(502, { status: "upstream_unreachable", error_code: "TRANSCRIBE_FETCH_FAILED" });
  } finally {
    clearTimeout(timeout);
  }
}
