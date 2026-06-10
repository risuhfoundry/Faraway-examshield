import { proxyApi } from "@/lib/api-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyApi("/plan", request);
}
