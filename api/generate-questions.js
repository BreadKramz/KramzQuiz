// api/generate-questions.js
export const config = { runtime: "edge" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return json(
      { error: "Missing GEMINI_API_KEY. Set it in Vercel → Project → Settings → Environment Variables." },
      500
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { imageDataUrl, imageUrl, count = 4, difficulty = "easy" } = payload || {};

  // Ensure we have an image to send
  let dataUrl = imageDataUrl;
  try {
    if (!dataUrl && imageUrl) {
      dataUrl = await toDataUrlFromRemote(imageUrl);
    }
  } catch (e) {
    return json({ error: `Failed to fetch imageUrl: ${e.message}` }, 400);
  }

  if (!dataUrl || !/^data:/.test(dataUrl)) {
    return json({ error: "Provide imageDataUrl (data:*;base64,...) or a valid imageUrl" }, 400);
  }

  let mime, b64;
  try {
    ({ mime, b64 } = parseDataUrl(dataUrl));
  } catch {
    return json({ error: "Invalid imageDataUrl format" }, 400);
  }

  const prompt = buildPrompt(count, difficulty);

  try {
    // Call Google Gemini (REST)
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mime, data: b64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    const out = await geminiRes.json();

    if (!geminiRes.ok) {
      return json({ error: `Gemini error: ${JSON.stringify(out, null, 2)}` }, geminiRes.status || 500);
    }

    // Pull the model text out
    const text =
      out?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    if (!text) {
      return json({ error: "No content returned by Gemini" }, 502);
    }

    // The model should return strict JSON. Handle code fences if any.
    let parsed;
    try {
      parsed = tryParseJsonFromText(text);
    } catch (e) {
      return json({
        error: "Failed to parse JSON from model",
        raw: text,
        hint:
          "Ensure the response is valid JSON matching { questions: [ {question, options[4], correctIndex} ] }",
      }, 502);
    }

    // Validate shape
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      return json({ error: "Model did not return questions[]", raw: parsed }, 502);
    }

    // Light validation of each item
    const cleaned = parsed.questions
      .filter(
        (q) =>
          q &&
          typeof q.question === "string" &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correctIndex === "number" &&
          q.correctIndex >= 0 &&
          q.correctIndex < 4
      )
      .map((q) => ({
        question: q.question.trim(),
        options: q.options.map((o) => String(o)),
        correctIndex: q.correctIndex,
      }));

    if (cleaned.length === 0) {
      return json({ error: "No valid questions generated", raw: parsed }, 502);
    }

    return json({ questions: cleaned.slice(0, Number(count) || 4) });
  } catch (e) {
    return json({ error: `Server exception: ${e.message}` }, 500);
  }
}

// ---------- helpers ----------

function buildPrompt(count, difficulty) {
  return `
You are a quiz generator. Using ONLY the information visible in the image, create exactly ${count} multiple-choice questions at ${difficulty} difficulty.

Output STRICT JSON ONLY (no backticks, no markdown), with this exact shape:

{
  "questions": [
    {
      "question": "string, <= 140 chars, clear and answerable from the image",
      "options": ["A","B","C","D"],
      "correctIndex": 0
    }
  ]
}

Rules:
- Always provide exactly 4 options.
- "correctIndex" is 0..3.
- Do not include explanations.
- Do not hallucinate facts not supported by the image.
`.trim();
}

function parseDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error("bad data url");
  return { mime: m[1], b64: m[2] };
}

async function toDataUrlFromRemote(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const mime = r.headers.get("content-type") || "image/jpeg";
  const ab = await r.arrayBuffer();
  const b64 = base64FromArrayBuffer(ab);
  return `data:${mime};base64,${b64}`;
}

// Base64 in Edge runtime without Buffer
function base64FromArrayBuffer(ab) {
  let binary = "";
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000; // 32KB chunks to avoid stack issues
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in Edge runtime
  return btoa(binary);
}

function tryParseJsonFromText(text) {
  // If model wrapped JSON in ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(raw);
  } catch {
    // Fallback: slice from first '{' to last '}'
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("not json");
  }
}
