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
      return res.status(400).json({ error: "Missing investment data." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing in Vercel." });
    }

    const prompt = `
You are FIA, the Foreign Investment Assistant.

You are preparing a premium Big 4-style New Zealand overseas investment / FIF workpaper for accountant review.

The client is paying for more than classification. They want:
- calculations where possible
- clear tax logic
- method comparison
- risk flags
- missing data requests
- practical next steps
- strategic advice an accountant or tax advisor would value

Important constraints:
- Do not invent numbers that are not supported by the source data.
- You may calculate using supplied values and clearly label assumptions.
- Convert values when exchange rates are supplied.
- If exact transaction-date FX is missing, use available rates only for indicative calculations and say so.
- Clearly separate: Facts, Calculations, Assumptions, Issues, Recommendations.
- Do not say "consult a tax advisor" repeatedly. This is already an accountant-review draft.
- Keep language confident, professional, concise, and commercially useful.
- Do not return JSON.
- Use markdown headings and tables.
- Where possible, include a table with: asset, jurisdiction, type, FIF status, reason, risk, action.
- Where possible, include indicative FDR and CV calculations.
- Where possible, calculate approximate NZD opening value, closing value, purchases, sales, dividends, withholding tax, and estimated FIF income.
- If de minimis may apply, calculate apparent cost/opening exposure and explain whether more cost data is needed.
- Include strategic advice: structure, documentation, data collection, broker process, and future-year process improvements.

Use this exact report structure:

# FIA Draft Report

## 1. Executive View
Give a short client-ready conclusion with the most important findings.

## 2. Data Reviewed
Summarise the data provided and the limitations.

## 3. Investment Classification
Create a clear table.

## 4. Indicative Calculations
Calculate what can be calculated from the supplied data. Show formulas briefly.

## 5. FIF Method Analysis
Discuss FDR vs CV, which appears preferable from available data, and what is missing.

## 6. De Minimis / Threshold View
Explain whether the NZD 50,000 threshold appears relevant based on available data.

## 7. Dividends and Foreign Tax Credits
Summarise dividends and withholding tax in source currency and indicative NZD if possible.

## 8. Key Tax Risks
Rank issues as High / Medium / Low.

## 9. Client Questions / Missing Data Request
List exactly what the client/accountant should request next.

## 10. Strategic Recommendations
Give practical advice a large client would pay for: controls, broker exports, annual process, portfolio structuring, PIE vs direct foreign holdings, ASX treatment review, evidence pack.

## 11. Draft Workpaper Conclusion
Concise conclusion.

## 12. Disclaimer
Short accountant-review disclaimer.

Investment data:
${content}
    `.trim();

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        reasoning: { effort: "medium" },
        max_output_tokens: 5000,
        text: {
          format: { type: "text" },
          verbosity: "medium"
        },
        input: [
          {
            role: "user",
            content: prompt
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
