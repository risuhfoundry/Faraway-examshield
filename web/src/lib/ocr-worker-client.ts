import { readFile } from "fs/promises";

const OCR_WORKER_URL = process.env.OCR_WORKER_URL ?? "http://127.0.0.1:8765/analyze";

type OcrWorkerResponse =
  | {
      status: "completed";
      confidence: number;
      text: string;
      processingTimeMs: number;
      message?: string;
    }
  | {
      status: "failed";
      confidence?: number;
      text?: string;
      processingTimeMs?: number;
      error: string;
    };

export async function runOcrWorker(asset: { filePath: string; fileType: string }) {
  const bytes = await readFile(asset.filePath);
  const response = await fetch(OCR_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": asset.fileType,
    },
    body: new Uint8Array(bytes),
  });

  if (!response.ok) {
    throw new Error(`OCR worker returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as OcrWorkerResponse;

  if (payload.status === "failed") {
    throw new Error(payload.error || "OCR worker failed.");
  }

  return {
    text: payload.text,
    confidence: payload.confidence,
    processingTimeMs: payload.processingTimeMs,
  };
}
