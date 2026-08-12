import { NextResponse } from "next/server";
import {
  IMPORT_PROMPT,
  extractJson,
  parseImportResponse,
} from "@/lib/portfolio-import";
import { enforceRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const DEFAULT_MODEL = "gpt-4o";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Lets the UI find out whether image import is usable before asking someone to
 * pick a file, rather than failing them after the upload.
 */
export async function GET() {
  return NextResponse.json(
    { configured: Boolean(process.env.OPENAI_API_KEY) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "import");
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Image import is not configured. Add an OPENAI_API_KEY environment variable to enable it.",
        configured: false,
      },
      { status: 501 }
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("image");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded file." },
      { status: 400 }
    );
  }

  if (!file) {
    return NextResponse.json({ error: "No image was uploaded." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Upload a PNG, JPEG, WebP, or GIF screenshot." },
      { status: 415 }
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "That image is larger than 8 MB. Try a screenshot instead of a photo." },
      { status: 413 }
    );
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let completion: Response;
  try {
    completion = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL ?? DEFAULT_MODEL,
        // Low temperature: this is transcription, not composition.
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: IMPORT_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${file.type};base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the image reading service." },
      { status: 502 }
    );
  }

  if (!completion.ok) {
    // The upstream body can contain the API key's org details, so it is logged
    // rather than returned.
    console.error(
      "Vision import failed:",
      completion.status,
      await completion.text().catch(() => "")
    );

    const message =
      completion.status === 401
        ? "The configured API key was rejected."
        : "The image reading service returned an error.";

    return NextResponse.json({ error: message }, { status: 502 });
  }

  let content: string;
  try {
    const payload = await completion.json();
    content = payload?.choices?.[0]?.message?.content ?? "";
  } catch {
    return NextResponse.json(
      { error: "Could not understand the response from the image reader." },
      { status: 502 }
    );
  }

  const result = parseImportResponse(extractJson(content));

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
