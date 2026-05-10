export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { content } = req.body || {};

    if (!content) {
      return res.status(400).json({ error: "Missing content" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing in Vercel" });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        reasoning: {
          effort: "none"
        },
        max_output_tokens: 1800,
        input: [
          {
            role: "system",
            content: "You are FIA, a New Zealand FIF tax workpaper assistant. Produce a concise accountant-style draft report. Do not invent numbers. Flag uncertainties."
          },
          {
            role: "user",
            content: `Analyse this broker statement and produce a FIA draft report:\n\n${content}`
          }
        ]
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: data.error?.message || JSON.stringify(data, null, 2)
      });
    }

    return res.status(200).json({
      output_text: data.output_text || JSON.stringify(data, null, 2)
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unknown server error"
    });
  }
}
