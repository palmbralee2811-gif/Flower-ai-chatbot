/**
 * Cloudflare Worker for PIM Flower Studio RAG Chatbot
 * ทำหน้าที่เป็น Serverless Proxy ถือกุญแจ OPENROUTER_KEY ไว้ฝั่งเซิร์ฟเวอร์
 * เพื่อความปลอดภัยสูงสุด ป้องกัน API Key รั่วไหล
 */

// โดเมนที่อนุญาตให้เรียกใช้งาน Worker (CORS)
// แก้ไขเพิ่ม URL ของ GitHub Pages ของตนเอง เช่น "https://username.github.io"
const ALLOWED = [
  "https://pimflower.github.io",
  "https://github.io",
  "http://localhost:8000",
  "http://localhost:5500",
  "http://localhost:3000",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:5500"
];

// OpenRouter API Base URL
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";

    // ตรวจสอบ CORS Origin (อนุญาต localhost, 127.0.0.1, โดเมนที่อยู่ใน ALLOWED, GitHub Pages หรือ Cloudflare Pages)
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

    // 1. หน้าทดสอบสถานะ Worker (ตามคู่มือ ตอนที่ 4 ขั้นที่ 2.4)
    // เมื่อเปิดลิงก์ Worker ตรงๆ ในเบราว์เซอร์ จะตอบกลับ {"status":"ok","hasKey":true}
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      const hasKey = Boolean(env.OPENROUTER_KEY && env.OPENROUTER_KEY.trim() !== "");
      return new Response(
        JSON.stringify({
          status: "ok",
          hasKey: hasKey,
          message: hasKey 
            ? "PIM Flower Studio Worker is ready! (Key is configured)" 
            : "Worker is running, but OPENROUTER_KEY secret is not set yet in Cloudflare Settings."
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

    // ตรวจสอบว่ามี OPENROUTER_KEY หรือ GEMINI_KEY หรือไม่
    const apiKey = env.OPENROUTER_KEY || env.GEMINI_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "API Key secret is missing. Please set OPENROUTER_KEY (or GEMINI_KEY) in Cloudflare Worker Settings > Bindings."
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

    // 2. ส่งต่อคำขอไปยัง AI Provider (OpenRouter หรือ Google Gemini)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        let parsedBody = {};
        try { parsedBody = JSON.parse(bodyText); } catch(e) {}

        // กรณีเป็น Google Gemini API Key (ขึ้นต้นด้วย AIzaSy)
        if (apiKey.startsWith("AIzaSy")) {
          const messages = parsedBody.messages || [];
          let systemInstruction = "คุณคือนักจัดดอกไม้และผู้ช่วยตอบคำถามของร้าน Bloomie Florist";
          const contents = [];

          for (const m of messages) {
            if (m.role === "system") {
              systemInstruction = m.content;
            } else {
              contents.push({
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.content }]
              });
            }
          }

          if (contents.length === 0) {
            contents.push({ role: "user", parts: [{ text: "สวัสดี" }] });
          }

          const geminiModel = "gemini-2.5-flash";
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: contents,
              generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
            })
          });

          const geminiData = await geminiRes.json();
          const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัยค่ะ ระบบไม่สามารถประมวลผลคำตอบได้";

          // ส่งกลับในฟอร์แมตมาตรฐาน OpenAI choices
          const responsePayload = {
            choices: [{
              message: { role: "assistant", content: replyText }
            }]
          };

          return new Response(JSON.stringify(responsePayload), {
            status: geminiRes.status,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              ...corsHeaders,
            },
          });
        }

        // กรณีเป็น OpenRouter Key (sk-or-v1-...)
        let targetEndpoint = `${OPENROUTER_BASE_URL}/chat/completions`;
        if (url.pathname.includes("/embeddings") || url.pathname.endsWith("/embeddings")) {
          targetEndpoint = `${OPENROUTER_BASE_URL}/embeddings`;
        }

        const openRouterResponse = await fetch(targetEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": origin || "https://pimflower.github.io",
            "X-Title": "Bloomie Florist RAG Chatbot",
          },
          body: bodyText,
        });

        const responseData = await openRouterResponse.text();

        return new Response(responseData, {
          status: openRouterResponse.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Worker Proxy Error", details: err.message }),
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
  },
};
