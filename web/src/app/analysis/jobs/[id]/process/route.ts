import {
  completeAnalysisJob,
  failAnalysisJob,
  getEvidenceAsset,
  markAnalysisJobProcessing,
  runAttributionForEvidence,
} from "@/lib/evidence-store";
import { runOcrWorker } from "@/lib/ocr-worker-client";
import type { EvidenceActivityEvent } from "@/lib/evidence-types";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const timeline: EvidenceActivityEvent[] = [];
  let evidenceId: string | null = null;

  try {
    const processing = await markAnalysisJobProcessing(id);
    evidenceId = processing.job.evidenceId;
    timeline.push(processing.activity);

    const asset = await getEvidenceAsset(evidenceId);
    if (!asset) {
      throw new Error("Evidence file was not found.");
    }

    const ocrResult = await runOcrWorker(asset);
    const completed = await completeAnalysisJob(id, ocrResult);
    timeline.push(...completed.activity);
    const attribution = await runAttributionForEvidence(
      completed.evidence.evidenceId,
      completed.evidence.ocrText ?? "",
    );
    timeline.push(...attribution.activity);

    return Response.json({
      message: "Analysis Complete",
      evidence: completed.evidence,
      job: completed.job,
      attribution: attribution.attribution,
      activity: timeline,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";

    try {
      const failed = await failAnalysisJob(id, message);
      return Response.json(
        {
          message: "Analysis Failed",
          evidence: failed.evidence,
          job: failed.job,
          activity: [...timeline, ...failed.activity],
        },
        { status: 200 },
      );
    } catch {
      return Response.json(
        { error: evidenceId ? message : "Analysis job not found." },
        { status: evidenceId ? 500 : 404 },
      );
    }
  }
}
