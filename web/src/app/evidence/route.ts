import { listEvidence } from "@/lib/evidence-store";

export const runtime = "nodejs";

export async function GET() {
  const payload = await listEvidence();
  return Response.json(payload);
}
