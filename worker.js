/**
 * Cloudflare Worker for Bloomie Florist RAG Chatbot
 * ทำหน้าที่เป็น Serverless Proxy เชื่อมต่อกับ Google Gemini API โดยตรง
 * รองรับกุญแจ GEMINI_KEY หรือ OPENROUTER_KEY เพื่อความปลอดภัยสูงสุด
 */

// โดเมนที่อนุญาตให้เรียกใช้งาน Worker (CORS)
const ALLOWED = [
  "https://pimflower.github.io",
  "https://palmbralee2811-gif.github.io",
  "https://github.io",
  "http://localhost:8000",
  "http://localhost:5500",
  "http://localhost:3000",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:5500"
];

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";

    // ตรวจสอบ CORS Origin (อนุญาต localhost, 127.0.0.1, GitHub Pages หรือ Cloudflare Pages)
    const isAllowedOrigin = ALLOWED.some(allowed => 
      origin.toLowerCase().startsWith(allowed.toLowerCase()) || 
      origin.toLowerCase().endsWith(".github.io") ||
      origin.toLowerCase().endsWith(".pages.dev") ||
      origin.includes("localhost") || 
      origin.includes("127.0.0.1")
    );

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowedOrigin && origin ? origin : "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Title",
      "Access-Control-Max-Age": "86400",
    };

    // จัดการ CORS Preflight (OPTIONS request)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    // ตรวจสอบ API Key ใน Cloudflare Worker Environment Variables / Secrets
    const apiKey = (env.GEMINI_KEY || env.OPENROUTER_KEY || "").trim();

    // 1. หน้าทดสอบสถานะ Worker (เปิดลิงก์ Worker ตรงๆ ในเบราว์เซอร์)
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      const hasKey = Boolean(apiKey !== "");
      return new Response(
        JSON.stringify({
          status: "ok",
          provider: "Google Gemini API",
          hasKey: hasKey,
          message: hasKey 
            ? "Bloomie Florist Gemini Worker is ready! (Key is configured)" 
            : "Worker is running, but GEMINI_KEY secret is not set yet in Cloudflare Settings."
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        }
      );
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_KEY secret is missing. Please set GEMINI_KEY (or OPENROUTER_KEY) in Cloudflare Worker Settings > Bindings."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        }
      );
    }

    // 2. จัดการคำขอ POST (Chat Completions & Embeddings)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        let parsed = {};
        try { parsed = JSON.parse(bodyText); } catch(e) {}

        // กรณีเป็น Embedding Request
        if (url.pathname.includes("/embeddings")) {
          const inputText = parsed.input || parsed.text || "";
          const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
          
          const embedRes = await fetch(embedUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "models/text-embedding-004",
              content: { parts: [{ text: inputText }] }
            })
          });

          const embedData = await embedRes.json();
          const vector = embedData.embedding?.values || [];

          return new Response(
            JSON.stringify({
              data: [{ embedding: vector, index: 0 }]
            }),
            {
              status: embedRes.status,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                ...corsHeaders,
              },
            }
          );
        }

        // กรณีเป็น Chat Completions Request
        const messages = parsed.messages || [];
        let systemInstruction = "คุณคือนักจัดดอกไม้และผู้ช่วยตอบคำถามของร้าน Bloomie Florist ตอบด้วยความอบอุ่น สุภาพ และอ้างอิงข้อมูลของร้านอย่างถูกต้อง";
        const contents = [];

        for (const m of messages) {
          if (m.role === "system") {
            systemInstruction = m.content;
          } else {
            contents.push({
              role: m.role === "user" ? "user" : "model",
              parts: [{ text: m.content || "" }]
            });
          }
        }

        if (contents.length === 0) {
          contents.push({ role: "user", parts: [{ text: "สวัสดี" }] });
        }

        // กำหนดโมเดล Gemini
        let model = DEFAULT_GEMINI_MODEL;
        if (parsed.model && parsed.model.includes("gemini")) {
          model = parsed.model.replace("google/", "");
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            contents: contents,
            generationConfig: {
              temperature: parsed.temperature ?? 0.3,
              maxOutputTokens: parsed.max_tokens ?? 1000
            }
          })
        });

        const geminiData = await geminiRes.json();

        // ตรวจสอบข้อผิดพลาดจาก Google
        if (!geminiRes.ok) {
          return new Response(JSON.stringify(geminiData), {
            status: geminiRes.status,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              ...corsHeaders,
            },
          });
        }

        const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัยค่ะ ระบบไม่สามารถประมวลผลคำตอบได้";

        // แปลงผลลัพธ์เป็นฟอร์แมตมาตรฐาน OpenAI choices เพื่อให้ chat-widget.js อ่านได้ทันที
        const responsePayload = {
          id: "chatcmpl-" + Date.now(),
          choices: [
            {
              message: {
                role: "assistant",
                content: replyText
              },
              finish_reason: "stop"
            }
          ]
        };

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        });

      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Gemini Worker Proxy Error", details: err.message }),
          {
            status: 502,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              ...corsHeaders,
            },
          }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }
};
