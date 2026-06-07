import { createEvidence } from "@/lib/evidence-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Evidence file is required." }, { status: 400 });
  }

  try {
    const payload = await createEvidence(file);
    return Response.json(
      {
        message: "Evidence Created",
        ...payload,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Evidence upload failed." },
      { status: 400 },
    );
  }
}
