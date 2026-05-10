export const config = {
  maxDuration: 60
};

function extractOutputText(data) {
  if (data.output_text) return data.output_text;

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (contentItem.type === "output_text" && contentItem.text) {
            return contentItem.text;
          }
        }
      }
    }
  }

  return JSON.stringify(data, null, 2);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { content } = req.body || {};

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Missing broker statement content." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing in Vercel." });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        reasoning: { effort: "none" },
        max_output_tokens: 1800,
        text: {
          format: { type: "text" },
          verbosity: "medium"
        },
        input: [
          {
            role: "system",
            content: `
You are FIA, the Foreign Investment Assistant.

You prepare New Zealand FIF / overseas investment tax workpapers for accountant review.

Write in a clean, concise, professional style.

Important:
- Do not return JSON.
- Do not mention internal model details.
- Do not invent missing numbers.
- Separate facts from assumptions.
- Flag uncertain items clearly.
- Do not give final tax advice.
- If a calculation cannot be completed, state exactly what data is missing.
            `.trim()
          },
          {
            role: "user",
            content: `
Analyse the broker statement below and produce a clean FIA draft report.

Use this exact structure:

FIA Draft Report
Client Overview
Key Findings
Investment Classification
Income & Foreign Tax
FIF Calculation Readiness
Missing Information
Accountant Review Notes
Disclaimer

Broker statement:
${content}
            `.trim()
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

    const reportText = extractOutputText(data);

    return res.status(200).json({
      output_text: reportText
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unknown server error."
    });
  }
}
