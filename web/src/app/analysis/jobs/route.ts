import {
  createAnalysisJob,
  getEvidenceById,
} from "@/lib/evidence-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let evidenceId: string | undefined;

  try {
    const body = (await request.json()) as { evidenceId?: string };
    evidenceId = body.evidenceId;
  } catch {
    return Response.json({ error: "JSON body is required." }, { status: 400 });
  }

  if (!evidenceId) {
    return Response.json({ error: "evidenceId is required." }, { status: 400 });
  }

  try {
    const queued = await createAnalysisJob(evidenceId);
    const evidence = await getEvidenceById(evidenceId);

    return Response.json({
      message: "Analysis Queued",
      evidence,
      job: queued.job,
      activity: [queued.activity],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    return Response.json({ error: message }, { status: 404 });
  }
}
