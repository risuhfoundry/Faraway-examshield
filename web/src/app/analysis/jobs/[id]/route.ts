import { proxyApi } from "@/lib/api-proxy";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApi(`/analysis/jobs/${encodeURIComponent(id)}`, request);
}
