export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const OPENAI_MODEL = "gpt-5.4-mini";
const MAX_INPUT_CHARS = 350_000;

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (
            contentItem.type === "output_text" &&
            typeof contentItem.text === "string"
          ) {
            return contentItem.text;
          }

          if (typeof contentItem.text === "string") {
            return contentItem.text;
          }
        }
      }
    }
  }

  return JSON.stringify(data, null, 2);
}

function cleanInput(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function limitInput(content) {
  if (content.length <= MAX_INPUT_CHARS) {
    return {
      content,
      wasTrimmed: false,
      originalChars: content.length,
    };
  }

  return {
    content:
      content.slice(0, MAX_INPUT_CHARS) +
      `\n\n--- SYSTEM NOTE: Input was trimmed from ${content.length.toLocaleString()} characters to ${MAX_INPUT_CHARS.toLocaleString()} characters to keep the analysis within MVP processing limits. Ask the client for a smaller export or pre-summarised broker report for complete analysis. ---`,
    wasTrimmed: true,
    originalChars: content.length,
  };
}

function buildPrompt(content, meta) {
  return `
You are FIA, the Foreign Investment Assistant.

You are preparing a premium Big 4-style New Zealand overseas investment / FIF workpaper for accountant review.

The client is paying for more than classification. They want:
- calculations where possible
- clear New Zealand tax logic
- method comparison
- risk flags
- missing data requests
- practical next steps
- strategic advice an accountant or tax advisor would value

Important constraints:
- Do not invent numbers that are not supported by the source data.
- You may calculate using supplied values and clearly label assumptions.
- Convert values only when exchange rates are supplied.
- If exact transaction-date FX is missing, use available rates only for indicative calculations and say so.
- Clearly separate: Facts, Calculations, Assumptions, Issues, Recommendations.
- Do not repeatedly say "consult a tax advisor". This is already an accountant-review draft.
- Keep language confident, professional, concise, and commercially useful.
- Do not return JSON.
- Use markdown headings and tables.
- Where possible, include a table with: asset, jurisdiction, type, FIF status, reason, risk, action.
- Where possible, include indicative FDR and CV calculations.
- Where possible, calculate approximate NZD opening value, closing value, purchases, sales, dividends, withholding tax, and estimated FIF income.
- If de minimis may apply, calculate apparent cost/opening exposure and explain whether more cost data is needed.
- Include strategic advice: structure, documentation, data collection, broker process, and future-year process improvements.
- If the data is raw CSV, infer columns carefully and explain any limitations.
- If the file appears incomplete, say exactly what is missing.
- Keep the report under 500 words unless calculations require slightly more.

Input metadata:
- Original character count: ${meta.originalChars}
- Input trimmed: ${meta.wasTrimmed ? "Yes" : "No"}

Use this exact report structure and include sections only where useful:

# FIA Draft Report

## 1. Executive View

## 2. Data Reviewed

## 3. Investment Classification

## 4. Indicative Calculations

## 5. FIF Method Analysis

## 6. De Minimis / Threshold View

## 7. Dividends and Foreign Tax Credits

## 8. Key Tax Risks

## 9. Client Questions / Missing Data Request

## 10. Strategic Recommendations

Investment data:
${content}
`.trim();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY missing in Vercel Environment Variables.",
      });
    }

    const rawContent = req.body?.content;
    const cleanedContent = cleanInput(rawContent);

    if (!cleanedContent || typeof cleanedContent !== "string") {
      return res.status(400).json({
        error: "Missing investment data. Upload a CSV/TXT file or paste text first.",
      });
    }

    if (cleanedContent.length < 10) {
      return res.status(400).json({
        error: "Investment data is too short to analyse.",
      });
    }

    const limited = limitInput(cleanedContent);
    const prompt = buildPrompt(limited.content, {
      originalChars: limited.originalChars.toLocaleString(),
      wasTrimmed: limited.wasTrimmed,
    });

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        reasoning: {
          effort: "medium",
        },
        max_output_tokens: 5000,
        text: {
          format: {
            type: "text",
          },
          verbosity: "medium",
        },
        input: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    let data;

    try {
      data = await openaiResponse.json();
    } catch {
      const rawText = await openaiResponse.text();

      return res.status(502).json({
        error: "OpenAI returned a non-JSON response.",
        details: rawText,
      });
    }

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error:
          data?.error?.message ||
          data?.message ||
          "OpenAI request failed.",
        details: data,
      });
    }

    const reportText = extractOutputText(data);

    if (!reportText || reportText.trim().length < 20) {
      return res.status(502).json({
        error: "OpenAI returned an empty or invalid report.",
        details: data,
      });
    }

    return res.status(200).json({
      output_text: reportText,
      meta: {
        model: OPENAI_MODEL,
        input_chars: cleanedContent.length,
        input_trimmed: limited.wasTrimmed,
      },
    });
  } catch (error) {
    console.error("FIA analyse error:", error);

    return res.status(500).json({
      error: error?.message || "Unknown server error.",
    });
  }
}
