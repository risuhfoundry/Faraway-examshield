import type { AnalysisJobResponse } from "@/lib/evidence-types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    const preview = text.slice(0, 160).replace(/\s+/g, " ");
    if (preview.startsWith("<!DOCTYPE") || preview.startsWith("<html")) {
      throw new Error(
        "The analysis API returned an HTML error page instead of JSON. OCR runs in the background on Render; this usually means the frontend proxy timed out before OCR finished.",
      );
    }
    throw new Error(preview || `Unexpected response (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

export async function waitForAnalysisJob(
  jobId: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<AnalysisJobResponse> {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 180000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`/analysis/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    });
    const payload = await parseJsonResponse<AnalysisJobResponse | { error: string }>(response);

    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : "Failed to fetch analysis status.");
    }

    const status = payload.job?.status;
    if (status === "completed" || status === "failed") {
      return payload;
    }

    await sleep(intervalMs);
  }

  throw new Error("Analysis timed out while waiting for OCR to finish.");
}
