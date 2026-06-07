import { listAlerts } from "@/lib/evidence-store";

export const runtime = "nodejs";

export async function GET() {
  const alerts = await listAlerts();
  return Response.json({ alerts });
}
