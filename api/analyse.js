export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { content } = req.body || {};

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Missing broker statement content." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing in Vercel Environment Variables."
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: [
          {
            role: "system",
            content: `
You are FIA, the Foreign Investment Assistant.

You help prepare New Zealand FIF / overseas investment tax workpapers.

You are not giving final tax advice. You are producing an accountant-review draft.

Rules:
- Do not invent missing numbers.
- Separate facts, assumptions, and review items.
- Be conservative.
- Flag uncertain items for accountant review.
- Produce a professional Big 4-style report.
- If calculations cannot be completed, explain exactly what data is missing.
            `
          },
          {
            role: "user",
            content: `
Analyse this broker / investment statement and produce a FIA draft report.

Required report sections:

1. Executive Summary
2. Data Reviewed
3. Investments Identified
4. Likely FIF Investments
5. Likely Exempt / Non-FIF Investments
6. Australian Exemption Issues
7. Dividends, Distributions and Foreign Tax
8. Reconciliation Issues
9. Missing Information / Client Questions
10. Draft FIF Calculation Notes
11. Accountant Review Notes
12. Disclaimer

Broker data:

${content}
            `
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || JSON.stringify(data, null, 2)
      });
    }

    return res.status(200).json({
      output_text:
        data.output_text ||
        data.output?.[0]?.content?.[0]?.text ||
        JSON.stringify(data, null, 2)
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unknown server error."
    });
  }
}
