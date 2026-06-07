import { runAnalysisJob } from "@/lib/analysis-pipeline";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const payload = await runAnalysisJob(id);
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 404 },
    );
  }
}
