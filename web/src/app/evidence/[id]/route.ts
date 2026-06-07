import { getEvidenceBundle } from "@/lib/evidence-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bundle = await getEvidenceBundle(id);

  if (!bundle) {
    return Response.json({ error: "Evidence not found." }, { status: 404 });
  }

  return Response.json(bundle);
}
