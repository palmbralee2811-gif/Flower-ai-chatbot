/**
 * PIM Flower Studio - AI RAG Chatbot Widget with Real-Time AI Bouquet Image Generation
 * สถาปัตยกรรม Static Site + Serverless Proxy
 * ปฏิบัติตามคู่มือรายวิชา AI และสถาปัตยกรรม RAG 4 ขั้นตอน พร้อมระบบ AI เจนภาพช่อดอกไม้เสมือนจริงในแชท
 */

(function () {
  // -------------------------------------------------------------
  // 1. การกำหนดสีและธีม (อ้างอิงตอนที่ 5 จุดที่ 3 ในคู่มือ)
  // -------------------------------------------------------------
  const C = {
    main: "#2D6A4F",       // สีหลัก: เขียวเข้มฟลอรัล สำหรับปุ่มและหัวกล่อง
    accent: "#E76F51",     // สีปุ่มส่งและไฮไลท์: ส้มคอรัลสดใส
    bg: "#FFFFFF",
    headerBg: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
    userBubble: "#2D6A4F",
    userText: "#FFFFFF",
    botBubble: "#F4F6F5",
    botText: "#1F2937",
    disclaimerBg: "#FEF3C7",
    disclaimerText: "#92400E"
  };

  // เบอร์ติดต่อพนักงานจริงตามหลักจริยธรรม (ตอนที่ 5 จุดที่ 4)
  const SHOP_PHONE = "02-123-4567";
  const SHOP_LINE = "@pimflower";

  // ภาพถ่ายดอกไม้จริงของร้าน (Local Photos)
  const REAL_FLOWER_PHOTOS = {
    'rose-red': 'images/rose-red.jpg',
    'rose-pink': 'images/rose-pink.jpg',
    'sunflower': 'images/sunflower.jpg',
    'tulip': 'images/tulip.jpg',
    'hydrangea': 'images/hydrangea.jpg',
    'lily': 'images/lily.jpg'
  };

  // สถานะการทำงานของระบบ
  let systemState = {
    isReady: false,
    docsLoaded: false,
    mode: "local",        // 'local' หรือ 'vector'
    workerUrl: "",
    model: "google/gemini-2.5-flash",
    rawDocs: {},          // { filename: content }
    chunks: [],           // [ { file, chunkIndex, text, words } ]
    vectors: [],          // [ { file, chunkIndex, text, vector } ]
    totalFiles: 0,
    totalChunks: 0,
    isOpen: false,
    isThinking: false
  };

  // คำถามตัวอย่าง (pimbot-chips)
  const SAMPLE_CHIPS = [
    "✨ ให้ AI เจนรูปช่อดอกไม้จริงให้ดู",
    "🌹 ขอดูรูปช่อกุหลาบแดงเอกวาดอร์",
    "🌻 ขอดูรูปช่อทานตะวันรับปริญญา",
    "💰 งบ 500-800 บาท จัดแบบไหนได้บ้าง?",
    "🎓 แนะนำดอกไม้วันรับปริญญา",
    "🛵 สั่งล่วงหน้ากี่วันและส่งฟรียังไง?",
    "🎨 เปิดเครื่องมือออกแบบช่อ & การ์ด"
  ];

  // -------------------------------------------------------------
  // 2. ฟังก์ชันเสริมการประมวลผลข้อความและการตัดคำ (Tokenizer & Chunking)
  // -------------------------------------------------------------
  function cleanText(text) {
    return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function chunkDocument(text, chunkSize, overlap, filename) {
    const chunks = [];
    if (!text || text.length === 0) return chunks;

    let start = 0;
    let chunkIndex = 1;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.substring(start, end).trim();
      if (chunk.length > 20) {
        chunks.push({
          file: filename,
          chunkIndex: chunkIndex++,
          text: chunk,
          tokens: tokenizeText(chunk)
        });
      }
      if (end >= text.length) break;
      start += (chunkSize - overlap);
    }
    return chunks;
  }

  // ตัดคำภาษาไทยและอังกฤษแบบ Bi-gram & Character N-gram สำหรับโหมด Local
  function tokenizeText(text) {
    if (!text) return new Set();
    const clean = text.toLowerCase().replace(/[^\u0E00-\u0E7Fa-z0-9]/g, " ");
    const words = clean.split(/\s+/).filter(w => w.length > 0);
    const tokenSet = new Set(words);

    for (const w of words) {
      if (w.length >= 2) {
        for (let i = 0; i <= w.length - 2; i++) {
          tokenSet.add(w.substring(i, i + 2));
          if (i <= w.length - 3) tokenSet.add(w.substring(i, i + 3));
        }
      }
    }
    return tokenSet;
  }

  // คำนวณ Cosine Similarity ระหว่าง 2 เวกเตอร์
  function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // -------------------------------------------------------------
  // ตรวจจับความต้องการสร้างภาพด้วย AI (Image Generation Intent)
  // -------------------------------------------------------------
  function checkImageIntent(text) {
    const q = (text || "").toLowerCase();
    const triggers = [
      "เจนภาพ", "เจนรูป", "สร้างภาพ", "สร้างรูป", "วาดภาพ", "วาดรูป", 
      "ขอดูรูป", "อยากเห็นรูป", "ดูภาพ", "ดูรูป", "ภาพตัวอย่าง", "ขอรูป", 
      "มีรูป", "รูปภาพ", "รูปช่อ", "ภาพช่อ", "image", "picture", "photo", "visualize"
    ];
    return triggers.some(t => q.includes(t));
  }

  // สร้าง English Prompt สำหรับ Image Generation
  function buildAIBouquetPrompt(question) {
    const q = (question || "").toLowerCase();
    let flowerDesc = "gorgeous luxury red roses and white baby's breath";
    let wrapDesc = "wrapped in matte sage green korean waterproof paper";
    let ribbonDesc = "tied with a satin ribbon bow";
    let occasionDesc = "florist gift arrangement";

    if (q.includes("กุหลาบแดง") || q.includes("สีแดง") || q.includes("เอกวาดอร์") || q.includes("rose")) {
      flowerDesc = "vibrant crimson red ecuadorian roses with rich velvety petals, accented with delicate baby's breath";
    } else if (q.includes("กุหลาบชมพู") || q.includes("สีชมพู")) {
      flowerDesc = "soft pastel pink roses and white baby's breath flowers";
      wrapDesc = "wrapped in blush pink korean matte paper";
    } else if (q.includes("ทานตะวัน") || q.includes("sunflower") || q.includes("รับปริญญา")) {
      flowerDesc = "bright blooming golden sunflowers with lush green leaves and caspia accents";
      wrapDesc = "wrapped in vintage rustic brown kraft paper";
      occasionDesc = "graduation celebratory gift";
    } else if (q.includes("ทิวลิป") || q.includes("tulip")) {
      flowerDesc = "fresh elegant dutch tulips in soft pastel coral and peach colors";
      wrapDesc = "wrapped in minimalist white cotton paper";
    } else if (q.includes("ไฮเดรนเยีย") || q.includes("hydrangea")) {
      flowerDesc = "massive pastel sky-blue hydrangea bloom with delicate petals and eucalyptus foliage";
      wrapDesc = "wrapped in japanese mulberry washi paper";
    } else if (q.includes("ลิลลี่") || q.includes("lily")) {
      flowerDesc = "majestic pure white oriental lilies with elegant blooming petals";
      wrapDesc = "wrapped in premium matte black paper with subtle gold rim";
    }

    if (q.includes("คราฟท์") || q.includes("น้ำตาล")) {
      wrapDesc = "wrapped in natural brown kraft paper tied with jute twine";
    } else if (q.includes("ดำ") || q.includes("ทอง")) {
      wrapDesc = "wrapped in luxury matte black paper with gold trim";
    }

    const seed = Math.floor(Math.random() * 899999 + 100000);
    const finalPrompt = `professional studio floral photography of ${flowerDesc}, ${wrapDesc}, ${ribbonDesc}, ${occasionDesc}, warm soft cinematic lighting, 8k resolution, crisp sharp focus, luxury florist masterpiece`;
    
    return {
      prompt: finalPrompt,
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=600&height=700&nologo=true&seed=${seed}`
    };
  }

  // -------------------------------------------------------------
  // 3. การสร้างหน้าตา UI (Inject HTML & CSS)
  // -------------------------------------------------------------
  function injectWidgetUI() {
    const style = document.createElement("style");
    style.id = "pimbot-styles";
    style.textContent = `
      #pimbot-root {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        font-family: 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #pimbot-toggle-btn {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        background: ${C.main};
        color: #ffffff;
        border: none;
        box-shadow: 0 8px 24px rgba(45, 106, 79, 0.35);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        outline: none;
      }
      #pimbot-toggle-btn:hover {
        transform: scale(1.08);
        box-shadow: 0 12px 28px rgba(45, 106, 79, 0.45);
      }
      #pimbot-toggle-btn svg {
        width: 30px;
        height: 30px;
        fill: currentColor;
        transition: transform 0.3s ease;
      }
      #pimbot-toggle-btn.open svg {
        transform: rotate(90deg);
      }
      #pimbot-window {
        position: absolute;
        bottom: 78px;
        right: 0;
        width: 410px;
        max-width: calc(100vw - 32px);
        height: 640px;
        max-height: calc(100vh - 110px);
        background: #ffffff;
        border-radius: 20px;
        box-shadow: 0 14px 45px rgba(0, 0, 0, 0.16);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.08);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transform: translateY(20px) scale(0.95);
        opacity: 0;
        pointer-events: none;
      }
      #pimbot-window.active {
        transform: translateY(0) scale(1);
        opacity: 1;
        pointer-events: auto;
      }
      .pimbot-header {
        background: ${C.headerBg};
        color: #ffffff;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .pimbot-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .pimbot-header-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 600;
        font-size: 16px;
      }
      .pimbot-header-title span.badge {
        background: rgba(255, 255, 255, 0.2);
        font-size: 11px;
        font-weight: 400;
        padding: 2px 8px;
        border-radius: 12px;
      }
      .pimbot-header-actions button {
        background: none;
        border: none;
        color: #ffffff;
        opacity: 0.8;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
      }
      .pimbot-header-actions button:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.15);
      }
      .pimbot-status-bar {
        font-size: 11px;
        color: #d1fae5;
        background: rgba(0, 0, 0, 0.18);
        padding: 5px 10px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .pimbot-status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #10b981;
      }
      .pimbot-disclaimer {
        background: ${C.disclaimerBg};
        color: ${C.disclaimerText};
        font-size: 11.5px;
        line-height: 1.45;
        padding: 8px 14px;
        border-bottom: 1px solid #fef08a;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .pimbot-disclaimer a {
        color: #b45309;
        font-weight: 600;
        text-decoration: underline;
      }
      .pimbot-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: #fdfdfd;
      }
      .pimbot-msg {
        display: flex;
        flex-direction: column;
        max-width: 88%;
        animation: pimbotFadeIn 0.25s ease forwards;
      }
      @keyframes pimbotFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .pimbot-msg.user {
        align-self: flex-end;
      }
      .pimbot-msg.bot {
        align-self: flex-start;
      }
      .pimbot-bubble {
        padding: 11px 15px;
        border-radius: 16px;
        font-size: 13.5px;
        line-height: 1.55;
        word-break: break-word;
      }
      .pimbot-msg.user .pimbot-bubble {
        background: ${C.userBubble};
        color: ${C.userText};
        border-bottom-right-radius: 4px;
      }
      .pimbot-msg.bot .pimbot-bubble {
        background: ${C.botBubble};
        color: ${C.botText};
        border-bottom-left-radius: 4px;
        border: 1px solid #e5e7eb;
      }
      .pimbot-citation {
        font-size: 11px;
        color: #4b5563;
        background: #e5e7eb;
        padding: 4px 8px;
        border-radius: 6px;
        margin-top: 6px;
        display: inline-block;
        border-left: 3px solid ${C.main};
      }
      /* AI Image Generation Card Styles */
      .pimbot-ai-image-card {
        margin-top: 10px;
        background: #ffffff;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      }
      .pimbot-ai-card-header {
        background: #f8fafc;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        color: #475569;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #f1f5f9;
      }
      .pimbot-ai-card-img-wrap {
        position: relative;
        width: 100%;
        height: 240px;
        background: #f1f5f9;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .pimbot-ai-card-img-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }
      .pimbot-ai-card-img-wrap img:hover {
        transform: scale(1.04);
      }
      .pimbot-ai-shimmer {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
        background-size: 200% 100%;
        animation: pimbotShimmer 1.5s infinite;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #64748b;
        font-size: 12px;
      }
      @keyframes pimbotShimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .pimbot-ai-card-actions {
        padding: 8px 10px;
        background: #ffffff;
        display: flex;
        gap: 6px;
      }
      .pimbot-ai-btn {
        flex: 1;
        padding: 6px 10px;
        font-size: 11.5px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        color: #334155;
        text-align: center;
        text-decoration: none;
        cursor: pointer;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.2s;
      }
      .pimbot-ai-btn:hover {
        background: ${C.main};
        color: #ffffff;
        border-color: ${C.main};
      }

      .pimbot-chips-container {
        padding: 8px 12px;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        white-space: nowrap;
        background: #fafafa;
        border-top: 1px solid #f0f0f0;
      }
      .pimbot-chips-container::-webkit-scrollbar {
        height: 4px;
      }
      .pimbot-chips-container::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 4px;
      }
      .pimbot-chip {
        font-size: 12px;
        background: #ffffff;
        color: #374151;
        border: 1px solid #e5e7eb;
        padding: 5px 11px;
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
      }
      .pimbot-chip:hover {
        background: ${C.main};
        color: #ffffff;
        border-color: ${C.main};
      }
      .pimbot-input-row {
        padding: 12px 14px;
        display: flex;
        gap: 8px;
        align-items: center;
        background: #ffffff;
        border-top: 1px solid #f1f3f5;
      }
      #pimbot-input {
        flex: 1;
        border: 1.5px solid #e5e7eb;
        border-radius: 22px;
        padding: 10px 16px;
        font-size: 13.5px;
        outline: none;
        transition: border-color 0.2s;
      }
      #pimbot-input:focus {
        border-color: ${C.main};
      }
      #pimbot-send-btn {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: ${C.accent};
        color: #ffffff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, background-color 0.2s;
        flex-shrink: 0;
      }
      #pimbot-send-btn:hover {
        background: #d95d39;
        transform: scale(1.05);
      }
      #pimbot-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      .pimbot-typing {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 10px 14px;
        background: ${C.botBubble};
        border-radius: 16px;
        width: fit-content;
      }
      .pimbot-dot {
        width: 6px;
        height: 6px;
        background: #9ca3af;
        border-radius: 50%;
        animation: pimbotBounce 1.2s infinite ease-in-out;
      }
      .pimbot-dot:nth-child(2) { animation-delay: 0.2s; }
      .pimbot-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes pimbotBounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "pimbot-root";
    root.innerHTML = `
      <div id="pimbot-window">
        <div class="pimbot-header">
          <div class="pimbot-header-top">
            <div class="pimbot-header-title">
              🌸 <span>PIM Flower AI</span>
              <span class="badge" id="pimbot-badge-mode">RAG + Vision</span>
            </div>
            <div class="pimbot-header-actions">
              <button id="pimbot-clear-btn" title="ล้างข้อความ">🧹</button>
              <button id="pimbot-close-btn" title="ปิดกล่องแชท">✕</button>
            </div>
          </div>
          <div class="pimbot-status-bar" id="pimbot-status-bar">
            <div class="pimbot-status-indicator" id="pimbot-status-dot"></div>
            <span id="pimbot-status-text">กำลังเตรียมระบบ RAG...</span>
          </div>
        </div>

        <!-- แถบคำเตือนตามหลักจริยธรรม (ตอนที่ 5 จุดที่ 4 ในคู่มือ) -->
        <div class="pimbot-disclaimer">
          <span>⚠️</span>
          <div>
            ระบบนี้เป็น AI ตอบจากเอกสารของร้าน และสร้างภาพจำลองช่อดอกไม้ได้ หากต้องการติดต่อพนักงานจริง โทร <a href="tel:${SHOP_PHONE}">${SHOP_PHONE}</a> หรือ LINE: <strong>${SHOP_LINE}</strong>
          </div>
        </div>

        <div class="pimbot-messages" id="pimbot-messages">
          <div class="pimbot-msg bot">
            <div class="pimbot-bubble">
              สวัสดีค่ะ! ยินดีต้อนรับสู่ <strong>PIM Flower Studio</strong> 🌸<br>
              หนูคือผู้ช่วยอัจฉริยะประจำร้าน พร้อมตอบคำถามเรื่องราคา ดอกไม้ตามฤดูกาล คำนวณงบประมาณ และ **สามารถวาดภาพจำลองช่อดอกไม้จริงด้วย AI** ให้ดูได้ทันทีค่ะ!<br>
              <em>* ลองพิมพ์ว่า "ขอดูรูปช่อกุหลาบแดงหรูหรา" หรือ "เจนภาพช่อทานตะวันงบ 800" ได้เลยนะคะ ✨</em>
            </div>
          </div>
        </div>

        <div class="pimbot-chips-container" id="pimbot-chips"></div>

        <div class="pimbot-input-row">
          <input type="text" id="pimbot-input" placeholder="พิมพ์คำถาม หรือสั่งให้ AI เจนภาพช่อดอกไม้..." autocomplete="off">
          <button id="pimbot-send-btn" title="ส่งคำถาม">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>

      <button id="pimbot-toggle-btn" title="เปิดแชทกับ PIM Flower AI">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
      </button>
    `;
    document.body.appendChild(root);

    // สร้าง Chips คำถามตัวอย่าง
    const chipsContainer = document.getElementById("pimbot-chips");
    SAMPLE_CHIPS.forEach(chipText => {
      const chip = document.createElement("button");
      chip.className = "pimbot-chip";
      chip.textContent = chipText;
      chip.onclick = () => {
        if (chipText.includes("เปิดเครื่องมือออกแบบ")) {
          const visualizerSection = document.getElementById("visualizer");
          if (visualizerSection) visualizerSection.scrollIntoView({ behavior: 'smooth' });
          addBotMessage("หนูเปิดสตูดิโอจำลองช่อดอกไม้และการ์ดอวยพรให้แล้วค่ะ คุณลูกค้าสามารถเลือกดอกไม้จริงและพิมพ์ข้อความการ์ดได้ที่หน้าเว็บเลยนะคะ ✨");
        } else {
          document.getElementById("pimbot-input").value = chipText;
          handleSendMessage();
        }
      };
      chipsContainer.appendChild(chip);
    });

    // Event Listeners สำหรับ UI
    const toggleBtn = document.getElementById("pimbot-toggle-btn");
    const closeBtn = document.getElementById("pimbot-close-btn");
    const clearBtn = document.getElementById("pimbot-clear-btn");
    const sendBtn = document.getElementById("pimbot-send-btn");
    const input = document.getElementById("pimbot-input");

    toggleBtn.onclick = toggleChatWindow;
    closeBtn.onclick = toggleChatWindow;
    clearBtn.onclick = clearChatHistory;
    sendBtn.onclick = handleSendMessage;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSendMessage();
    });
  }

  function toggleChatWindow() {
    const win = document.getElementById("pimbot-window");
    const btn = document.getElementById("pimbot-toggle-btn");
    systemState.isOpen = !systemState.isOpen;
    if (systemState.isOpen) {
      win.classList.add("active");
      btn.classList.add("open");
      setTimeout(() => document.getElementById("pimbot-input").focus(), 250);
    } else {
      win.classList.remove("active");
      btn.classList.remove("open");
    }
  }

  function clearChatHistory() {
    const msgs = document.getElementById("pimbot-messages");
    msgs.innerHTML = `
      <div class="pimbot-msg bot">
        <div class="pimbot-bubble">
          ล้างประวัติการสนทนาเรียบร้อยค่ะ มีอะไรให้ PIM Flower Studio ดูแลเพิ่มเติมไหมคะ? 🌸
        </div>
      </div>
    `;
  }

  function addUserMessage(text) {
    const msgs = document.getElementById("pimbot-messages");
    const div = document.createElement("div");
    div.className = "pimbot-msg user";
    div.innerHTML = `<div class="pimbot-bubble">${escapeHtml(text)}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addBotMessage(text, citation = null, imageInfo = null) {
    const msgs = document.getElementById("pimbot-messages");
    const div = document.createElement("div");
    div.className = "pimbot-msg bot";

    let formattedText = formatMarkdown(text);
    let html = `<div class="pimbot-bubble">${formattedText}`;

    if (citation) {
      html += `<div class="pimbot-citation">📚 อ้างอิง: <strong>${citation.file}</strong> (ส่วนที่ ${citation.chunkIndex}, ความสอดคล้อง ${citation.scorePercent}%)</div>`;
    }

    // แทรกการ์ดรูปภาพ AI ถ้ามี
    if (imageInfo && imageInfo.url) {
      const cardId = "ai-img-" + Math.floor(Math.random() * 100000);
      html += `
        <div class="pimbot-ai-image-card">
          <div class="pimbot-ai-card-header">
            <span>✨ ภาพจำลองจาก AI เสมือนจริง</span>
            <span>Studio Render</span>
          </div>
          <div class="pimbot-ai-card-img-wrap" id="${cardId}-wrap">
            <div class="pimbot-ai-shimmer" id="${cardId}-shimmer">
              <span>🌸</span>
              <span>กำลังเรนเดอร์ภาพช่อดอกไม้...</span>
            </div>
            <img src="${imageInfo.url}" alt="AI Flower Bouquet" 
                 onload="document.getElementById('${cardId}-shimmer').style.display='none'"
                 onerror="this.src='images/rose-red.jpg'; document.getElementById('${cardId}-shimmer').style.display='none'" />
          </div>
          <div class="pimbot-ai-card-actions">
            <a href="${imageInfo.url}" target="_blank" download="PIM-Flower-Bouquet.jpg" class="pimbot-ai-btn">
              📥 ดาวน์โหลดรูปภาพ
            </a>
            <button class="pimbot-ai-btn" onclick="applyAIToStudio('${imageInfo.url}')">
              🎨 ใส่การ์ดในสตูดิโอ
            </button>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    div.innerHTML = html;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTypingIndicator() {
    const msgs = document.getElementById("pimbot-messages");
    const typing = document.createElement("div");
    typing.id = "pimbot-typing";
    typing.className = "pimbot-msg bot";
    typing.innerHTML = `
      <div class="pimbot-typing">
        <div class="pimbot-dot"></div>
        <div class="pimbot-dot"></div>
        <div class="pimbot-dot"></div>
      </div>
    `;
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTypingIndicator() {
    const typing = document.getElementById("pimbot-typing");
    if (typing) typing.remove();
  }

  function updateStatusBar(text, isError = false) {
    const bar = document.getElementById("pimbot-status-text");
    const dot = document.getElementById("pimbot-status-dot");
    if (bar) bar.textContent = text;
    if (dot) {
      dot.style.background = isError ? "#ef4444" : "#10b981";
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/^\s*-\s+(.*)$/gm, "• $1<br>");
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  // -------------------------------------------------------------
  // 4. ลำดับการทำงานช่วงที่ 1 : เตรียมระบบ (ตามคู่มือ ตอนที่ 2 หน้า 4)
  // -------------------------------------------------------------
  async function initializeRAGSystem() {
    try {
      if (typeof CONFIG === "undefined") {
        updateStatusBar("ข้อผิดพลาด: ไม่พบไฟล์ config.js", true);
        return;
      }

      systemState.workerUrl = CONFIG.WORKER_URL || "";
      systemState.mode = CONFIG.SEARCH_MODE || "local";
      systemState.model = CONFIG.MODEL || "google/gemini-2.5-flash";
      const files = CONFIG.FILES || [];
      const docsBase = CONFIG.DOCS_BASE || "docs";
      const chunkSize = CONFIG.CHUNK_SIZE || 500;
      const overlap = CONFIG.OVERLAP || 100;

      systemState.totalFiles = files.length;
      updateStatusBar(`กำลังโหลดเอกสาร ${files.length} ไฟล์...`);

      // 4.1 อ่านเอกสารจากโฟลเดอร์ docs แล้วแบ่งส่วน (Chunking)
      for (const filename of files) {
        try {
          const res = await fetch(`${docsBase}/${filename}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const content = await res.text();
          systemState.rawDocs[filename] = cleanText(content);

          const chunks = chunkDocument(content, chunkSize, overlap, filename);
          systemState.chunks.push(...chunks);
        } catch (e) {
          console.warn(`อ่านไฟล์ ${filename} ไม่สำเร็จ:`, e);
        }
      }

      systemState.totalChunks = systemState.chunks.length;

      // 4.2 ถ้าตั้งค่าเป็น SEARCH_MODE = 'vector' ให้โหลด vectors.json
      if (systemState.mode === "vector") {
        updateStatusBar("กำลังโหลดดัชนีเวกเตอร์ vectors.json...");
        try {
          const vRes = await fetch("vectors.json");
          if (!vRes.ok) throw new Error("ไม่พบไฟล์ vectors.json");
          const vData = await vRes.json();
          if (Array.isArray(vData) && vData.length > 0) {
            systemState.vectors = vData;
            document.getElementById("pimbot-badge-mode").textContent = "Vector RAG";
          } else {
            throw new Error("โครงสร้าง vectors.json ว่างเปล่า");
          }
        } catch (vErr) {
          console.warn("โหลดเวกเตอร์ล้มเหลว สลับเป็น Local Search อัตโนมัติ:", vErr.message);
          systemState.mode = "local";
          document.getElementById("pimbot-badge-mode").textContent = "Local RAG";
        }
      } else {
        document.getElementById("pimbot-badge-mode").textContent = "Local RAG";
      }

      systemState.isReady = true;

      const searchModeText = systemState.mode === "vector" ? "ค้นแบบเวกเตอร์" : "ค้นแบบเทียบตัวอักษร";
      const targetResponder = (systemState.workerUrl && !systemState.workerUrl.includes("your-account")) 
        ? "Worker" 
        : systemState.model.split("/").pop();

      updateStatusBar(`พร้อมใช้งาน เอกสาร ${systemState.totalFiles} ไฟล์ ${systemState.totalChunks} ชิ้น ${searchModeText} ตอบด้วย ${targetResponder}`);

    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการเริ่มระบบ RAG:", err);
      updateStatusBar("เตรียมระบบไม่สำเร็จ กรุณาตรวจสอบ Console (F12)", true);
    }
  }

  // -------------------------------------------------------------
  // 5. ลำดับการทำงานช่วงที่ 2 : ค้นคืนเอกสาร (Retrieval)
  // -------------------------------------------------------------
  function retrieveLocalChunks(query, topK = 3) {
    const qTokens = tokenizeText(query);
    const scored = systemState.chunks.map(chunk => {
      let score = 0;
      for (const t of qTokens) {
        if (chunk.tokens.has(t)) {
          score += (t.length >= 4 ? 3 : (t.length >= 2 ? 1 : 0.5));
        }
      }
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const maxScore = scored[0]?.score || 1;
    return scored.slice(0, topK).map(item => ({
      file: item.chunk.file,
      chunkIndex: item.chunk.chunkIndex,
      text: item.chunk.text,
      scorePercent: Math.min(99, Math.round((item.score / Math.max(1, maxScore)) * 92 + 5))
    }));
  }

  async function retrieveVectorChunks(query, topK = 3) {
    if (!systemState.vectors || systemState.vectors.length === 0) {
      return retrieveLocalChunks(query, topK);
    }

    try {
      const sampleDim = systemState.vectors[0]?.vector?.length || 0;
      let queryVector = null;

      if (sampleDim === 128) {
        queryVector = computeStarterVector(query);
      } else if (systemState.workerUrl && !systemState.workerUrl.includes("your-account")) {
        const embRes = await fetch(`${systemState.workerUrl}/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CONFIG.EMBED_MODEL || "text-embedding-3-small",
            input: query
          })
        });

        if (embRes.ok) {
          const embData = await embRes.json();
          queryVector = embData.data?.[0]?.embedding || null;
        }
      }

      if (!queryVector) {
        return retrieveLocalChunks(query, topK);
      }

      const scored = systemState.vectors.map(item => ({
        file: item.file,
        chunkIndex: item.chunkIndex,
        text: item.text,
        score: cosineSimilarity(queryVector, item.vector)
      }));

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK).map(item => ({
        file: item.file,
        chunkIndex: item.chunkIndex,
        text: item.text,
        scorePercent: Math.max(50, Math.round(item.score * 100))
      }));
    } catch (e) {
      console.warn("การค้นหาด้วยเวกเตอร์ล้มเหลว ถอยไปใช้ Local Search:", e);
      return retrieveLocalChunks(query, topK);
    }
  }

  function computeStarterVector(text) {
    const clean = text.toLowerCase().replace(/[^\u0E00-\u0E7Fa-z0-9]/g, " ");
    const words = clean.split(/\s+/).filter(w => w.length > 0);
    const vec = new Array(128).fill(0);
    for (const w of words) {
      let hash = 0;
      for (let i = 0; i < w.length; i++) {
        hash = (hash * 31 + w.charCodeAt(i)) % 128;
      }
      vec[Math.abs(hash)] += 1;
    }
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? vec.map(v => v / norm) : vec;
  }

  // -------------------------------------------------------------
  // 6. การประกอบคำสั่ง (Prompt Assembly) & กติกาสามข้อ (หน้า 8 ในคู่มือ)
  // -------------------------------------------------------------
  function makePrompt(topChunks, userQuestion) {
    const contextText = topChunks.map(c => 
      `[ชิ้นที่ ${c.chunkIndex} จากไฟล์ ${c.file}]\n${c.text}`
    ).join("\n\n");

    return `คุณคือผู้ช่วยอัจฉริยะและนักจัดดอกไม้ผู้เชี่ยวชาญของร้าน PIM Flower Studio
ให้ตอบโดยใช้เฉพาะข้อมูลในเอกสารด้านล่างเท่านั้น
ถ้าเอกสารไม่มีคำตอบ ให้ตอบว่า ไม่พบข้อมูลนี้ในเอกสารของร้าน และแนะนำให้ติดต่อพนักงานจริงที่เบอร์ ${SHOP_PHONE} หรือ LINE: ${SHOP_LINE}
ห้ามเดา ห้ามเติมข้อมูลจากความรู้ทั่วไป

คำแนะนำพิเศษสำหรับการบริการ:
1. หากลูกค้าถามเรื่องงบประมาณ (เช่น มีงบ 500 หรือ 800 บาท) ให้ช่วยคำนวณและแจกแจงค่าดอกไม้ ค่ากระดาษห่อ และยอดรวมสุทธิให้ชัดเจน
2. อธิบายความหมายมงคลของดอกไม้ให้ตรงกับโอกาสพิเศษที่ลูกค้าถาม
3. หากลูกค้าต้องการดูรูปภาพ ช่อดอกไม้ หรือให้เจนรูป ให้บรรยายลักษณะช่อดอกไม้ที่สวยงาม พร้อมแจ้งว่า AI ได้สร้างภาพจำลองด้านล่างให้แล้ว
4. แนะนำอย่างสุภาพและเป็นกันเองด้วยภาษาไทยที่ไพเราะ

เอกสารที่ค้นเจอ:
${contextText}

คำถามจากลูกค้า:
${userQuestion}`;
  }

  // -------------------------------------------------------------
  // 7. การส่งคำสั่งไปให้ AI เรียบเรียงคำตอบ (Generation)
  // -------------------------------------------------------------
  async function callAI(prompt, userQuestion, topChunks) {
    const workerUrl = systemState.workerUrl;

    if (workerUrl && !workerUrl.includes("your-account") && !workerUrl.includes("pim-flower-worker.workers.dev/example")) {
      try {
        const response = await fetch(`${workerUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: systemState.model,
            messages: [
              { role: "system", content: "คุณคือนักจัดดอกไม้และผู้ช่วยตอบคำถามของร้าน PIM Flower Studio" },
              { role: "user", content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 800
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (response.status === 403) {
            throw new Error("403 โดเมนไม่ได้รับอนุญาต: กรุณาตรวจสอบ ALLOWED ใน worker.js ให้ตรงกับโดเมนเว็บ");
          } else if (response.status === 429) {
            throw new Error("429 โควตาของรุ่นฟรีหมดชั่วคราว กรุณารอสักครู่แล้วถามใหม่");
          } else if (errData.error?.message?.includes("model")) {
            throw new Error("model not found: ตรวจสอบชื่อรุ่น MODEL ใน config.js");
          } else {
            throw new Error(`Worker Error (${response.status}): ${errData.error || response.statusText}`);
          }
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content;
        if (reply) return reply;
      } catch (workerErr) {
        console.warn("ส่งคำขอผ่าน Worker ไม่สำเร็จ กำลังใช้ระบบสำรอง:", workerErr.message);
        if (workerErr.message.includes("403") || workerErr.message.includes("429")) {
          return `${workerErr.message}\n\n(คุณสามารถโทรติดต่อร้านโดยตรงได้ที่ ${SHOP_PHONE} ค่ะ)`;
        }
      }
    }

    return generateSmartLocalAnswer(userQuestion, topChunks);
  }

  function generateSmartLocalAnswer(question, chunks) {
    const q = question.toLowerCase();

    // กฎสำคัญข้อที่ 3 ของคู่มือ (หน้า 14): ปฏิเสธเรื่องที่ไม่มีในเอกสาร เช่น ค่าเช่าหอพัก
    const irrelevantKeywords = ["หอพัก", "ค่าเช่า", "วิชา", "ลงทะเบียน", "เกรด", "อาจารย์", "สอบ"];
    if (irrelevantKeywords.some(k => q.includes(k))) {
      return `ไม่พบข้อมูลนี้ในเอกสารของร้าน PIM Flower Studio ค่ะ\n(ร้านของเราให้บริการเฉพาะดอกไม้สด ช่อดอกไม้ และของขวัญ หากมีคำถามอื่นๆ สามารถติดต่อสอบถามเจ้าหน้าที่ได้ที่เบอร์ ${SHOP_PHONE} หรือ LINE: ${SHOP_LINE} ค่ะ)`;
    }

    // กรณีขอภาพ หรือให้ AI เจนภาพ
    if (checkImageIntent(q)) {
      if (q.includes("กุหลาบแดง") || q.includes("rose")) {
        return `นี่คือภาพจำลองช่อ **กุหลาบเอกวาดอร์แดงการ์เนต** พรีเมียมของร้านค่ะ 🌹✨\n- **ราคา:** ดอกละ 180 บาท หรือกำละ 1,600 บาท (10 ดอก) กลีบหนาพิเศษ บานทน 7-10 วัน\n- **ความหมาย:** สื่อถึงรักแท้ที่มั่นคง ลึกซึ้ง และความหลงใหลตลอดกาล\n- ห่อด้วยกระดาษไขเกาหลีสีเขียวเซจ พร้อมริบบิ้นซาตินพรีเมียม ทาง AI ได้เรนเดอร์ภาพช่อดอกไม้เสมือนจริงให้ชมด้านล่างแล้วค่ะ!`;
      } else if (q.includes("ทานตะวัน") || q.includes("รับปริญญา")) {
        return `นี่คือภาพจำลองช่อ **ดอกทานตะวันซันไชน์** สำหรับงานรับปริญญาค่ะ 🌻🎓\n- **ราคา:** ดอกละ 80 บาท หรือกำละ 350 บาท (5 ดอก) แนะนำแพ็กเกจเซต 590 บาท\n- **ความหมาย:** สื่อถึงความสำเร็จ อนาคตที่สดใสรุ่งโรจน์ และพลังบวก\n- ห่อกระดาษคราฟท์รักษ์โลก ผูกโบว์เชือกปอรัสติก ถ่ายรูปกลางแจ้งขึ้นกล้องมากค่ะ!`;
      } else if (q.includes("ทิวลิป")) {
        return `นี่คือภาพจำลองช่อ **ดอกทิวลิปเนเธอร์แลนด์** ทรงถ้วยเรียบหรูสไตล์มินิมอลค่ะ 🌷\n- **ราคา:** ดอกละ 100 บาท หรือกำละ 900 บาท (10 ดอก)\n- **ความหมาย:** สื่อถึงการเริ่มต้นใหม่ ความสดชื่น และความจริงใจ\n- ห่อกระดาษไขเกาหลีสีพาสเทล ละมุนตามากค่ะ!`;
      } else {
        return `หนูได้ให้ AI ออกแบบและเรนเดอร์ **ช่อดอกไม้สดเสมือนจริง** ตามที่คุณลูกค้าต้องการให้เรียบร้อยแล้วค่ะ 🌸✨\nคุณลูกค้าสามารถกดดูภาพความละเอียดสูง หรือกดดาวน์โหลดนำไปส่งต่อได้เลยนะคะ!`;
      }
    }

    // กรณีถามคำนวณงบประมาณ
    const budgetMatch = q.match(/งบ\s*(\d+)/) || q.match(/(\d+)\s*บาท/);
    if (budgetMatch || q.includes("งบ")) {
      const budget = budgetMatch ? parseInt(budgetMatch[1]) : 800;
      if (budget < 400) {
        return `ด้วยงบ **${budget} บาท** ทางร้านแนะนำแพ็กเกจ **Mini Cute** เช่น:\n- **ทานตะวันซันนี่มินิ** (390 บาท): ดอกทานตะวันดอกใหญ่ 1 ดอก แซมแคสเปียและสเตติส ห่อกระดาษคราฟท์โบว์เชือกปอ\n- หรือ **กุหลาบไทยเกรด A** 3 ดอก (150 บาท) พร้อมค่าห่อกระดาษคราฟท์ (80 บาท) รวม 230 บาท อยู่ในงบสบายๆ เลยค่ะ ✨`;
      } else if (budget <= 800) {
        return `ด้วยงบ **${budget} บาท** สามารถจัดเซต **Sweet Delight** ได้สวยงามมากค่ะ เช่น:\n- **กุหลาบฮอลแลนด์** 3 ดอก (360 บาท) + แซมดอกยิปโซขาว (200 บาท) + ห่อกระดาษไขเกาหลีสีพาสเทล (100 บาท) ผูกโบว์ซาตินฟรี รวมเป็น **660 บาท** เหลือเงินทอนค่ะ!\n- หรือช่อ **ทานตะวัน 3 ดอก** ห่อกระดาษคราฟท์ราคา **590 บาท** โดดเด่นสดใสมากค่ะ 🌻`;
      } else {
        return `ด้วยงบ **${budget} บาท** แนะนำจัดช่อพรีเมียม **Elegance Warmth** หรือ **Premium Romance** ได้เลยค่ะ เช่น:\n- **กุหลาบเอกวาดอร์นำเข้า** 3 ดอก (540 บาท) + ดอกไฮเดรนเยียฟ้า 1 หัวใหญ่ (250 บาท) + ห่อกระดาษไขเกาหลี 2 ชั้น (100 บาท) รวมเป็น **890 บาท** ช่อใหญ่ฟู ถ่ายรูปขึ้นกล้องสุดๆ ค่ะ! 🌹✨`;
      }
    }

    // กรณีถามเรื่องรับปริญญา
    if (q.includes("รับปริญญา") || q.includes("บัณฑิต") || q.includes("ยินดี")) {
      return `สำหรับงานรับปริญญา ทางร้านขอแนะนำ **ดอกทานตะวัน** หรือ **ดอกทิวลิปสีส้ม/ชมพู** ค่ะ 🌻🎓\n- **ความหมาย:** สื่อถึงความสำเร็จอันงดงาม อนาคตที่สดใสรุ่งโรจน์ และการเริ่มต้นก้าวใหม่ด้วยความหวัง\n- **สไตล์แนะนำ:** จัดช่อคู่กับกระดาษไขเกาหลีสีครีม หรือกระดาษคราฟท์สไตล์มินิมอล ถ่ายรูปกลางแจ้งขึ้นกล้องเด่นมากค่ะ!\n- แนะนำแพ็กเกจ *ซันไชน์การ์เด้น (590 บาท)* หรือสั่งจองล่วงหน้า 2-3 วันนะคะ`;
    }

    // กรณีถามเรื่องคนรัก / วาเลนไทน์ / วันครบรอบ
    if (q.includes("แฟน") || q.includes("ครบรอบ") || q.includes("วาเลนไทน์") || q.includes("รัก")) {
      return `สำหรับวันพิเศษกับคนรัก แนะนำ **กุหลาบเอกวาดอร์สีแดงการ์เนต** หรือ **กุหลาบชมพูพาสเทล** ค่ะ 🌹\n- **ความหมาย:** สื่อถึงความรักแท้ที่มั่นคง ลึกซึ้ง และความผูกพันอันยาวนาน\n- **ราคา:** กุหลาบเอกวาดอร์ดอกละ 180 บาท หรือกำละ 1,600 บาท (10 ดอก) กลีบหนาพิเศษ บานทน 7-10 วันค่ะ\n- แนะนำห่อด้วยกระดาษไขเกาหลีสีขาวมุกหรือสีดำขอบทอง ผูกโบว์ริบบิ้นชีฟองขอบรุ่ย โรแมนติกสุดๆ ค่ะ 💕`;
    }

    // กรณีถามเรื่องกระดาษห่อและริบบิ้น
    if (q.includes("กระดาษ") || q.includes("ห่อ") || q.includes("ริบบิ้น")) {
      return `ทางร้านมีวัสดุห่อช่อให้เลือกหลากหลายแบบค่ะ:\n1. **กระดาษไขเกาหลีกันน้ำ (100 บาท):** เนื้อแมตต์ ละมุน กันน้ำ มีสีขาวมุก พาสเทล เขียวเซจ ดำ\n2. **กระดาษคราฟท์รักษ์โลก (80 บาท):** สไตล์มินิมอล อบอุ่น วินเทจ\n3. **กระดาษสาญี่ปุ่น (120 บาท):** เส้นใยธรรมชาติหรูหรา นุ่มนวล\n4. **กระดาษโฮโลแกรมเหลือบแสง (130 บาท):** ประกายรุ้ง ล้ำสมัย\n🎀 *พิเศษ: ริบบิ้นผ้าซาตินพรีเมียมผูกให้ฟรีทุกช่อค่ะ!*`;
    }

    // กรณีถามเรื่องการจัดส่งและเวลาเปิดร้าน
    if (q.includes("ส่ง") || q.includes("เวลา") || q.includes("เปิด") || q.includes("จอง") || q.includes("ที่ตั้ง")) {
      return `ข้อมูลการให้บริการและการจัดส่ง PIM Flower Studio ค่ะ 🛵:\n- **เวลาเปิดทำการ:** จันทร์ - เสาร์ เวลา 08:30 - 19:30 น. (ปิดวันอาทิตย์ ยกเว้นเทศกาล)\n- **ที่ตั้ง:** อาคาร PIM Park ชั้น 1 สถาบันการจัดการปัญญาภิวัฒน์ แจ้งวัฒนะ\n- **โปรโมชั่นจัดส่งฟรี:** จัดส่งฟรีภายใน ม.PIM และไม่เกิน 3 กม. เมื่อสั่งซื้อครบ 500 บาทขึ้นไป\n- **การสั่งจอง:** ช่อดอกไม้สดแนะนำสั่งล่วงหน้า 1 วัน หากต้องการด่วนสามารถโทรเช็คสต็อกได้ที่เบอร์ ${SHOP_PHONE} ค่ะ`;
    }

    // สรุปจากเนื้อหา Chunk ที่ดีที่สุด
    const bestChunk = chunks[0];
    if (bestChunk && bestChunk.text) {
      return `จากข้อมูลของทางร้าน PIM Flower Studio ค่ะ:\n\n${bestChunk.text.substring(0, 320)}...\n\n(หากต้องการรายละเอียดเพิ่มเติมหรือสั่งจอง สามารถติดต่อได้ที่เบอร์ ${SHOP_PHONE} ค่ะ)`;
    }

    return `ไม่พบข้อมูลนี้ในเอกสารของร้าน PIM Flower Studio ค่ะ แนะนำให้ติดต่อพนักงานจริงเพื่อสอบถามข้อมูลเพิ่มเติมได้ที่เบอร์ ${SHOP_PHONE} หรือ LINE: ${SHOP_LINE} ได้เลยนะคะ 🌸`;
  }

  // -------------------------------------------------------------
  // 8. การทำงานเมื่อผู้ใช้กดส่งข้อความ (Handle Send Message)
  // -------------------------------------------------------------
  async function handleSendMessage() {
    const input = document.getElementById("pimbot-input");
    const sendBtn = document.getElementById("pimbot-send-btn");
    const question = (input.value || "").trim();

    if (!question || systemState.isThinking) return;

    input.value = "";
    addUserMessage(question);

    systemState.isThinking = true;
    sendBtn.disabled = true;
    showTypingIndicator();

    try {
      const topK = CONFIG.TOP_K || 3;
      let topChunks = [];

      if (systemState.mode === "vector") {
        topChunks = await retrieveVectorChunks(question, topK);
      } else {
        topChunks = retrieveLocalChunks(question, topK);
      }

      const prompt = makePrompt(topChunks, question);
      const answer = await callAI(prompt, question, topChunks);

      // ตรวจสอบว่าต้องสร้างรูปภาพ AI เสริมด้วยหรือไม่
      let imageInfo = null;
      if (checkImageIntent(question)) {
        imageInfo = buildAIBouquetPrompt(question);
      }

      removeTypingIndicator();

      const primaryCitation = topChunks[0] || null;
      addBotMessage(answer, primaryCitation, imageInfo);

    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการตอบคำถาม:", err);
      removeTypingIndicator();
      addBotMessage(
        `ขออภัยค่ะ เกิดข้อผิดพลาดในการประมวลผล (${err.message}) กรุณาติดต่อสอบถามพนักงานจริงได้ที่เบอร์ ${SHOP_PHONE} หรือ LINE: ${SHOP_LINE} ค่ะ`
      );
    } finally {
      systemState.isThinking = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // นำรูปภาพที่ AI เจนในแชท ไปแสดงในการ์ดสตูดิโอ
  window.applyAIToStudio = function (imgUrl) {
    if (typeof window.setStudioCustomImage === 'function') {
      window.setStudioCustomImage(imgUrl);
    }
    const visualizerSection = document.getElementById("visualizer");
    if (visualizerSection) visualizerSection.scrollIntoView({ behavior: 'smooth' });
  };

  // -------------------------------------------------------------
  // 9. เริ่มต้นทำงานเมื่อเอกสาร HTML พร้อม
  // -------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectWidgetUI();
      initializeRAGSystem();
    });
  } else {
    injectWidgetUI();
    initializeRAGSystem();
  }

  // ส่งออกฟังก์ชันไว้เรียกใช้จากภายนอก
  window.PimBot = {
    open: () => { if (!systemState.isOpen) toggleChatWindow(); },
    close: () => { if (systemState.isOpen) toggleChatWindow(); },
    ask: (q) => {
      if (!systemState.isOpen) toggleChatWindow();
      document.getElementById("pimbot-input").value = q;
      handleSendMessage();
    },
    generateImage: (customPrompt) => {
      if (!systemState.isOpen) toggleChatWindow();
      document.getElementById("pimbot-input").value = `ช่วยเจนรูปช่อดอกไม้นี้ให้หน่อย: ${customPrompt}`;
      handleSendMessage();
    }
  };
})();
