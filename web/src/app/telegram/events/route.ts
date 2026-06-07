import { runAnalysisJob } from "@/lib/analysis-pipeline";
import {
  createAnalysisJob,
  createTelegramEvidenceEvent,
} from "@/lib/evidence-store";

export const runtime = "nodejs";

type TelegramJsonEvent = {
  messageId?: string | number;
  chatId?: string | number;
  timestamp?: string | number;
  text?: string | null;
};

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("multipart/form-data")
      ? await readMultipartTelegramEvent(request)
      : await readJsonTelegramEvent(request);

    const created = await createTelegramEvidenceEvent(input);
    if (created.duplicate) {
      return Response.json({
        message: "Telegram Event Already Processed",
        telegramEvent: created.telegramEvent,
        evidence: created.evidence,
        activity: created.activity,
      });
    }

    if (!created.evidence) {
      return Response.json(
        {
          message: "Telegram Event Stored",
          telegramEvent: created.telegramEvent,
          evidence: null,
          activity: created.activity,
        },
        { status: 202 },
      );
    }

    const queued = await createAnalysisJob(created.evidence.evidenceId);
    const analysis = await runAnalysisJob(queued.job.jobId);

    return Response.json(
      {
        message: "Telegram Evidence Processed",
        telegramEvent: created.telegramEvent,
        evidence: analysis.evidence,
        job: analysis.job,
        attribution: analysis.attribution ?? null,
        watermark: analysis.watermark ?? null,
        forensicReport: analysis.forensicReport ?? null,
        alert: analysis.alert ?? null,
        activity: [...created.activity, queued.activity, ...analysis.activity],
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Telegram event ingestion failed." },
      { status: 400 },
    );
  }
}

async function readMultipartTelegramEvent(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const messageId = readRequiredFormValue(formData, "messageId");
  const chatId = readRequiredFormValue(formData, "chatId");
  const timestamp = normalizeTelegramTimestamp(readOptionalFormValue(formData, "timestamp"));
  const text = readOptionalFormValue(formData, "text");

  return {
    messageId,
    chatId,
    timestamp,
    text,
    file: file instanceof File ? file : null,
  };
}

async function readJsonTelegramEvent(request: Request) {
  const body = (await request.json()) as TelegramJsonEvent;
  if (body.messageId === undefined || body.chatId === undefined) {
    throw new Error("messageId and chatId are required.");
  }

  return {
    messageId: String(body.messageId),
    chatId: String(body.chatId),
    timestamp: normalizeTelegramTimestamp(body.timestamp),
    text: body.text ?? null,
    file: null,
  };
}

function readRequiredFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function readOptionalFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTelegramTimestamp(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }

  if (!value) {
    return new Date().toISOString();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim().length <= 10) {
    return new Date(numeric * 1000).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("timestamp must be an ISO date or Telegram Unix timestamp.");
  }

  return parsed.toISOString();
}
