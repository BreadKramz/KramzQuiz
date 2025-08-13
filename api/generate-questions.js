export const config = { runtime: "edge" };

export default async function handler(req) {
    console.log("OPENAI_API_KEY length:", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);

if (!process.env.OPENAI_API_KEY) {
  return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
}


    
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { imageDataUrl, imageUrl, count = 4, difficulty = "easy" } = body;
  const imageSrc = imageDataUrl || imageUrl;
  if (!imageSrc) {
    return new Response(JSON.stringify({ error: "No image provided" }), { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
  }

  const systemPrompt = `
You create ${count} multiple-choice quiz questions from one image.
Difficulty: ${difficulty}.
Return ONLY valid JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0}]}
`;

  const payload = {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Generate questions based on this image." },
          { type: "image_url", image_url: { url: imageSrc } }
        ]
      }
    ]
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `OpenAI error: ${t}` }), { status: r.status });
    }

    const out = await r.json();
    const content = out?.choices?.[0]?.message?.content?.trim() || "";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Model did not return valid JSON", raw: content }), { status: 500 });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
