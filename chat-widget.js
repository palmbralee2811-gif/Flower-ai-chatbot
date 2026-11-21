/**
 * Bloomie Florist - AI RAG Chatbot Widget with Real-Time AI Bouquet Image Generation
 * ดีไซน์เอกลักษณ์ Bloomie Florist: โทนครีม เบจ และเขียวมะกอก (Cormorant Garamond + Anuphan)
 * สถาปัตยกรรม Static Site + Serverless Proxy ตามหลักสูตร RAG 4 ขั้นตอน พร้อมระบบ AI เจนภาพช่อดอกไม้เสมือนจริง
 */

(function () {
  // -------------------------------------------------------------
  // 1. กำหนดสีและธีม Bloomie Florist (โทนครีม เบจ และเขียวมะกอก)
  // -------------------------------------------------------------
  const THEME = {
    olive: "#354532",             // Deep Forest Green (ตรงกับ --deep ของ bloomie-luxe)
    oliveHover: "#485945",        // Deep Forest Green เมื่อ Hover
    oliveLight: "#66745b",        // สี Sage (--sage)
    oliveBg: "#f1eee7",           // พื้นหลังโทนกระดาษนวล
    cream: "#f7f5ef",             // สีครีมพื้นฐาน (--cream)
    creamCard: "#fffdf9",         // สีครีมกระดาษขาวสะอาด (--paper)
    creamBorder: "#e8e4db",       // เส้นขอบสีนวล (--line)
    warmBeige: "#f1eee7",         // สีเบจกระดาษ
    textDark: "#262b25",          // สีข้อความหลัก (--ink)
    textMuted: "#7f8278",         // สีข้อความรอง (--muted)
    userBubble: "#354532",        // กล่องข้อความผู้ใช้สีเขียวเข้มหรูหรา
    userText: "#FFFFFF",
    botBubble: "#fffdf9",
    botText: "#262b25",
    statusBg: "rgba(247, 245, 239, 0.95)",
    statusText: "#354532",
    disclaimerBg: "rgba(247, 245, 239, 0.95)",
    disclaimerBorder: "rgba(232, 228, 219, 0.9)",
    disclaimerText: "#7f8278",
    rust: "#c98263"
  };

  // เบอร์ติดต่อพนักงานจริงตามหลักจริยธรรม (ตอนที่ 5 จุดที่ 4)
  const SHOP_PHONE = "02-123-4567";
  const SHOP_LINE = "@bloomieflorist";

  // ภาพถ่ายดอกไม้จริงของร้าน (Local Photos)
  const REAL_FLOWER_PHOTOS = {
    'rose-red': 'images/rose-red.jpg',
    'rose-pink': 'images/rose-pink.jpg',
    'sunflower': 'images/sunflower.jpg',
    'tulip': 'images/tulip.jpg',
    'hydrangea': 'images/hydrangea.jpg',
    'lily': 'images/lily.jpg'
  };

  // สถานะการทำงานของระบบ RAG
  let systemState = {
    isReady: false,
    docsLoaded: false,
    mode: "local",        // 'local' หรือ 'vector'
    workerUrl: "",
    model: "openai/gpt-4o-mini",
    rawDocs: {},          // { filename: content }
    chunks: [],           // [ { file, chunkIndex, text, words } ]
    vectors: [],          // [ { file, chunkIndex, text, vector } ]
    totalFiles: 0,
    totalChunks: 0,
    isOpen: false,
    isThinking: false,
    history: []           // เก็บบริบทการสนทนาต่อเนื่อง [{ role: 'user'|'model', text: '...' }]
  };

  // คำถามตัวอย่าง 4 หมวดหลัก (ชุดไอคอนตาม Reference Design)
  const QUICK_QUESTIONS = [
    {
      id: "q-advance",
      icon: "images/icon-calendar.svg",
      text: "สั่งล่วงหน้าได้ไหม?",
      query: "สั่งล่วงหน้าได้ไหม?"
    },
    {
      id: "q-delivery",
      icon: "images/icon-truck.svg",
      text: "จัดส่งกี่วัน?",
      query: "จัดส่งกี่วัน?"
    },
    {
      id: "q-price",
      icon: "images/icon-tag.svg",
      text: "ราคาเท่าไหร่?",
      query: "ราคาเท่าไหร่?"
    },
    {
      id: "q-services",
      icon: "images/icon-help.svg",
      text: "มีบริการอะไรบ้าง?",
      query: "มีบริการอะไรบ้าง?"
    }
  ];

  // คำถามเสริมสำหรับ AI เจนรูป
  const EXTRA_AI_PROMPTS = [
    " กุหลาบ ทิวลิป ช่อดอกไม้ สีน้ำตาลครีมกระดาษเกาหลี ติดโบว์สีขาว",
    " ช่อกุหลาบแดงเอกวาดอร์หรูหรา",
    " ช่อทานตะวันรับปริญญา",
    " เปิดสตูดิโอออกแบบช่อดอกไม้ & การ์ด"
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
      "มีรูป", "รูปภาพ", "รูปช่อ", "ภาพช่อ", "image", "picture", "photo", "visualize", "gpt"
    ];
    if (triggers.some(t => q.includes(t))) return true;

    // ตรวจจับเมื่อระบุสเปกช่อดอกไม้ เช่น "กุหลาบ ทิวลิป ช่อดอกไม้ สีน้ำตาลครีมกระดาษเกาหลี ติดโบว์สีขาว"
    const hasFlower = q.includes("กุหลาบ") || q.includes("ทิวลิป") || q.includes("ทานตะวัน") || 
                      q.includes("ไฮเดรนเยีย") || q.includes("ลิลลี่") || q.includes("เดซี่") || q.includes("ดอกไม้");
    const hasStyle = q.includes("ห่อ") || q.includes("กระดาษ") || q.includes("โบว์") || 
                     q.includes("ริบบิ้น") || q.includes("สี") || q.includes("ช่อ");
    return (hasFlower && hasStyle);
  }

  // สร้าง English Prompt สำหรับ Image Generation โดยอิงโมเดล GPT
  function buildAIBouquetPrompt(question) {
    const q = (question || "").toLowerCase();

    // 1. ตรวจจับชนิดดอกไม้ (รองรับการผสมหลายชนิด เช่น กุหลาบ + ทิวลิป)
    const flowerList = [];
    if (q.includes("กุหลาบแดง") || q.includes("สีแดง") || q.includes("เอกวาดอร์")) {
      flowerList.push("huge velvety deep crimson red Ecuadorian roses");
    } else if (q.includes("กุหลาบชมพู") || q.includes("พาสเทล")) {
      flowerList.push("soft pastel blush pink garden roses");
    } else if (q.includes("กุหลาบขาว")) {
      flowerList.push("pristine elegant white Avalanche roses");
    } else if (q.includes("กุหลาบ") || q.includes("rose")) {
      flowerList.push("fresh premium blooming long-stem roses");
    }

    if (q.includes("ทิวลิป") || q.includes("tulip")) {
      flowerList.push("graceful blooming Dutch tulips in soft pastel coral and cream");
    }
    if (q.includes("ทานตะวัน") || q.includes("sunflower")) {
      flowerList.push("radiant golden sunny sunflowers with lush petals");
    }
    if (q.includes("ไฮเดรนเยีย") || q.includes("hydrangea")) {
      flowerList.push("plump cloud-like pastel blue and lilac hydrangea blossoms");
    }
    if (q.includes("ลิลลี่") || q.includes("lily")) {
      flowerList.push("luxurious fragrant white Asiatic lilies");
    }
    if (q.includes("พีโอนี") || q.includes("โบตั๋น") || q.includes("peony")) {
      flowerList.push("fluffy layered soft pink Sarah Bernhardt peonies");
    }
    if (q.includes("เยอบีร่า") || q.includes("gerbera")) {
      flowerList.push("cheerful vivid daisy-like gerberas");
    }
    if (q.includes("คาร์เนชั่น") || q.includes("carnation")) {
      flowerList.push("delicate ruffled carnations in peach and cream");
    }
    if (q.includes("เดซี่") || q.includes("daisy")) {
      flowerList.push("cheerful petite white chamomile daisies");
    }

    let flowerDesc = flowerList.length > 0 
      ? flowerList.join(" combined with ") 
      : "luxurious velvety roses and graceful Dutch tulips";

    // ดอกไม้แซม
    let foliageDesc = "delicately accented with airy white baby's breath (gypsophila)";
    if (q.includes("ยูคาลิปตัส") || q.includes("eucalyptus")) {
      foliageDesc = "accented with aromatic silver-dollar eucalyptus leaves";
    } else if (q.includes("แคสเปีย") || q.includes("caspia")) {
      foliageDesc = "accented with dreamy misty purple caspia sprigs";
    } else if (q.includes("สแตติส") || q.includes("statice")) {
      foliageDesc = "accented with vintage purple statice flowers";
    }

    // 2. ตรวจจับกระดาษห่อช่อ (Wrapping Paper)
    let wrapDesc = "artistically wrapped in stylish Korean matte waterproof paper with dimensional layered accordion pleats";
    if (q.includes("น้ำตาลครีม") || q.includes("ครีมน้ำตาล") || (q.includes("น้ำตาล") && q.includes("ครีม")) || q.includes("ชานม")) {
      wrapDesc = "artistically wrapped in luxurious cream-brown and warm milk tea beige Korean matte paper with soft dimensional pleats";
    } else if (q.includes("เขียวเซจ") || q.includes("เซจ") || (q.includes("เขียว") && q.includes("เกาหลี"))) {
      wrapDesc = "wrapped in matte sage green Korean waterproof paper";
    } else if (q.includes("ชมพู")) {
      wrapDesc = "wrapped in romantic blush pink Korean matte paper with delicate layered folds";
    } else if (q.includes("คราฟท์") || q.includes("kraft") || q.includes("รักษ์โลก")) {
      wrapDesc = "wrapped in vintage rustic eco brown craft paper";
    } else if (q.includes("ดำ") || q.includes("ทอง")) {
      wrapDesc = "wrapped in luxury matte black paper with fine gold trim";
    } else if (q.includes("ใส") || q.includes("opp") || q.includes("ฟิล์มใส")) {
      wrapDesc = "wrapped in crystal clear glossy OPP cellophane film showcasing flower stems";
    } else if (q.includes("ไข") || q.includes("tracing")) {
      wrapDesc = "wrapped in semi-translucent aesthetic vellum tracing paper";
    } else if (q.includes("สา") || q.includes("washi")) {
      wrapDesc = "wrapped in natural textured Japanese mulberry washi paper";
    } else if (q.includes("เกาหลี")) {
      wrapDesc = "wrapped in premium Korean matte pastel paper with elegant pleats";
    }

    // 3. ตรวจจับโบว์ริบบิ้น (Ribbon & Bow)
    let ribbonDesc = "tied with an exquisite silky satin ribbon bow with flowing ends";
    if (q.includes("โบว์สีขาว") || q.includes("โบว์ขาว") || q.includes("ริบบิ้นสีขาว") || q.includes("ริบบิ้นขาว") || q.includes("ขาว")) {
      ribbonDesc = "tied with an immaculate pure white silky satin ribbon bow with flowing ribbons";
    } else if (q.includes("โบว์ชมพู") || q.includes("ริบบิ้นชมพู")) {
      ribbonDesc = "tied with a soft blush pink satin ribbon bow";
    } else if (q.includes("โบว์แดง") || q.includes("ริบบิ้นแดง")) {
      ribbonDesc = "tied with a rich crimson red satin ribbon bow";
    } else if (q.includes("โบว์ทอง") || q.includes("ริบบิ้นทอง")) {
      ribbonDesc = "tied with a luxury champagne gold satin ribbon bow";
    } else if (q.includes("ชีฟอง")) {
      ribbonDesc = "tied with a delicate ethereal frayed-edge chiffon silk ribbon";
    } else if (q.includes("กำมะหยี่")) {
      ribbonDesc = "tied with a plush royal velvet ribbon bow";
    } else if (q.includes("ปอ") || q.includes("เชือก")) {
      ribbonDesc = "tied with natural rustic jute twine";
    }

    const seed = Math.floor(Math.random() * 899999 + 100000);
    const finalPrompt = `award-winning commercial florist catalog photography, an exquisite hand-tied bouquet featuring ${flowerDesc}, ${foliageDesc}, ${wrapDesc}, ${ribbonDesc}, boutique flower studio background, warm soft natural window lighting, shallow depth of field, creamy bokeh, clean composition, 8k resolution, ultra-detailed textures, realistic photographic masterpiece`;

    return {
      prompt: finalPrompt,
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=600&height=700&nologo=true&seed=${seed}`
    };
  }

  // -------------------------------------------------------------
  // 3. การสร้างหน้าตา UI Bloomie Florist (Inject HTML & CSS)
  // -------------------------------------------------------------
  function injectWidgetUI() {
    const style = document.createElement("style");
    style.id = "bloomie-bot-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap');

      #pimbot-root {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        font-family: 'Anuphan', sans-serif;
        color: ${THEME.textDark};
      }

      /* Floating Toggle Button */
      #pimbot-toggle-btn {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: ${THEME.olive};
        color: #ffffff;
        border: none;
        box-shadow: 0 10px 28px rgba(125, 139, 110, 0.42);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        outline: none;
        position: relative;
      }
      #pimbot-toggle-btn:hover {
        transform: scale(1.08);
        background: ${THEME.oliveHover};
        box-shadow: 0 14px 34px rgba(125, 139, 110, 0.52);
      }
      #pimbot-toggle-btn .bloomie-toggle-icon {
        width: 32px;
        height: 32px;
        transition: transform 0.3s ease;
      }
      #pimbot-toggle-btn.open .bloomie-toggle-icon {
        transform: rotate(90deg);
      }

      /* Pulse badge on toggle button */
      .bloomie-pulse-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 14px;
        height: 14px;
        background: #c98263;
        border: 2.5px solid #ffffff;
        border-radius: 50%;
        animation: bloomiePulse 2s infinite;
      }
      @keyframes bloomiePulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(201, 130, 99, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(201, 130, 99, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(201, 130, 99, 0); }
      }

      /* Main Chat Window */
      #pimbot-window {
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 420px;
        max-width: calc(100vw - 32px);
        height: 660px;
        max-height: calc(100vh - 110px);
        background: radial-gradient(circle at 10% 15%, rgba(255, 255, 255, 0.85) 0%, rgba(248, 245, 238, 0.95) 45%, rgba(238, 232, 222, 0.92) 100%);
        backdrop-filter: blur(20px) saturate(150%);
        -webkit-backdrop-filter: blur(20px) saturate(150%);
        border-radius: 30px;
        box-shadow: 0 24px 60px rgba(50, 42, 32, 0.16), 0 4px 20px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1.5px solid rgba(255, 255, 255, 0.9);
        transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        transform: translateY(20px) scale(0.95);
        opacity: 0;
        pointer-events: none;
      }
      #pimbot-window.active {
        transform: translateY(0) scale(1);
        opacity: 1;
        pointer-events: auto;
      }

      /* Bloomie Header: Olive Green Pill */
      .bloomie-header {
        margin: 14px 14px 8px 14px;
        background: ${THEME.olive};
        border-radius: 30px;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 4px 16px rgba(105, 119, 91, 0.28);
        color: #ffffff;
        flex-shrink: 0;
      }
      .bloomie-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .bloomie-header-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        flex-shrink: 0;
      }
      .bloomie-header-avatar img {
        width: 44px;
        height: 44px;
        object-fit: contain;
      }
      .bloomie-header-titles {
        display: flex;
        flex-direction: column;
        line-height: 1.25;
      }
      .bloomie-header-name {
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 20px;
        font-weight: 500;
        color: #ffffff;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .bloomie-header-name .heart {
        font-size: 14px;
        opacity: 0.9;
      }
      .bloomie-header-sub {
        font-family: 'Anuphan', sans-serif;
        font-size: 11px;
        font-weight: 300;
        color: rgba(255, 255, 255, 0.92);
        letter-spacing: 0.2px;
      }
      .bloomie-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .bloomie-header-btn {
        background: none;
        border: none;
        color: #ffffff;
        opacity: 0.9;
        cursor: pointer;
        font-size: 16px;
        padding: 4px 6px;
        border-radius: 6px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .bloomie-header-btn:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.2);
        transform: scale(1.05);
      }
      .bloomie-header-sep {
        color: rgba(255, 255, 255, 0.4);
        font-size: 14px;
        font-weight: 300;
      }

      /* Status Bar: Cream Translucent Capsule */
      .bloomie-status-bar {
        margin: 0 14px 6px 14px;
        background: ${THEME.statusBg};
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.85);
        border-radius: 20px;
        padding: 6px 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 11px;
        color: ${THEME.statusText};
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
        flex-shrink: 0;
      }
      .bloomie-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #52B788;
        display: inline-block;
        box-shadow: 0 0 6px rgba(82, 183, 136, 0.6);
      }
      .bloomie-status-sep {
        color: #C3B4A2;
        font-size: 12px;
      }

      /* Ethical Disclaimer Bar */
      .bloomie-disclaimer {
        margin: 0 14px 6px 14px;
        background: ${THEME.disclaimerBg};
        border: 1px solid ${THEME.disclaimerBorder};
        border-radius: 12px;
        padding: 5px 12px;
        font-size: 10.5px;
        line-height: 1.4;
        color: ${THEME.disclaimerText};
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .bloomie-disclaimer a {
        color: #925816;
        font-weight: 500;
        text-decoration: underline;
      }

      /* Chat Messages Scroll Container */
      .bloomie-messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scroll-behavior: smooth;
      }
      .bloomie-messages::-webkit-scrollbar {
        width: 5px;
      }
      .bloomie-messages::-webkit-scrollbar-thumb {
        background: rgba(125, 139, 110, 0.25);
        border-radius: 4px;
      }

      /* Message Rows */
      .bloomie-msg-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        animation: bloomieFadeIn 0.25s ease forwards;
      }
      @keyframes bloomieFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .bloomie-msg-row.user-row {
        justify-content: flex-end;
      }
      .bloomie-msg-row.bot-row {
        justify-content: flex-start;
      }

      /* Bot Avatar Circle next to message */
      .bloomie-bot-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #ffffff;
        border: 1.5px solid rgba(230, 222, 210, 0.9);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .bloomie-bot-avatar img {
        width: 32px;
        height: 32px;
        object-fit: contain;
      }

      /* Message Bubbles */
      .bloomie-bubble {
        padding: 13px 16px;
        border-radius: 22px;
        font-size: 13.5px;
        line-height: 1.6;
        word-break: break-word;
        max-width: 82%;
        font-family: 'Anuphan', sans-serif;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
      }
      .bloomie-bubble.user {
        background: ${THEME.userBubble};
        color: ${THEME.userText};
        border-bottom-right-radius: 4px;
        font-weight: 400;
      }
      .bloomie-bubble.bot {
        background: ${THEME.botBubble};
        color: ${THEME.botText};
        border-bottom-left-radius: 4px;
        border: 1px solid rgba(234, 227, 214, 0.85);
        font-weight: 400;
      }

      /* Welcoming Bubble Styling */
      .bloomie-welcome-title {
        font-size: 14.5px;
        font-weight: 600;
        color: #2D2722;
        margin-bottom: 6px;
      }
      .bloomie-welcome-desc {
        font-size: 13px;
        font-weight: 400;
        color: #4A443D;
        line-height: 1.6;
      }
      .bloomie-bubble.bot {
        background: #ffffff;
        color: ${THEME.botText};
        border-bottom-left-radius: 4px;
        border: 1px solid rgba(226, 218, 204, 0.9);
        box-shadow: 0 3px 12px rgba(70, 60, 48, 0.05);
        font-weight: 400;
      }
      .bloomie-ribbon-divider {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin: 12px 0 10px 0;
      }
      .bloomie-divider-line {
        flex: 1;
        height: 1px;
        background: rgba(200, 185, 170, 0.45);
      }
      .bloomie-ribbon-icon {
        width: 20px;
        height: 20px;
        display: inline-block;
        vertical-align: middle;
      }
      .bloomie-welcome-footer {
        font-size: 12.5px;
        font-weight: 400;
        color: #5C5449;
        text-align: left;
      }

      /* Citation / Reference Box */
      .bloomie-citation {
        font-size: 11px;
        color: #555047;
        background: rgba(243, 236, 226, 0.85);
        padding: 5px 10px;
        border-radius: 8px;
        margin-top: 8px;
        display: inline-block;
        border-left: 3px solid ${THEME.olive};
      }

      /* AI Image Generation Card */
      .bloomie-ai-card {
        margin-top: 10px;
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid rgba(225, 215, 200, 0.8);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
      }
      .bloomie-ai-card-header {
        background: #FAF7F2;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 500;
        color: #5C5449;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(235, 225, 212, 0.7);
      }
      .bloomie-ai-card-img-wrap {
        position: relative;
        width: 100%;
        height: 240px;
        background: #F5EFE6;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .bloomie-ai-card-img-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }
      .bloomie-ai-card-img-wrap img:hover {
        transform: scale(1.03);
      }
      .bloomie-ai-shimmer {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(90deg, #F5EFE6 25%, #EFE7DC 50%, #F5EFE6 75%);
        background-size: 200% 100%;
        animation: bloomieShimmer 1.5s infinite;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #7E7569;
        font-size: 12px;
      }
      @keyframes bloomieShimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .bloomie-ai-card-actions {
        padding: 8px 10px;
        background: #ffffff;
        display: flex;
        gap: 6px;
      }
      .bloomie-ai-btn {
        flex: 1;
        padding: 6px 10px;
        font-size: 11.5px;
        border-radius: 8px;
        border: 1px solid #DED4C5;
        background: #FAF7F2;
        color: #4A443B;
        text-align: center;
        text-decoration: none;
        cursor: pointer;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.2s;
        font-family: 'Anuphan', sans-serif;
      }
      .bloomie-ai-btn:hover {
        background: ${THEME.olive};
        color: #ffffff;
        border-color: ${THEME.olive};
      }

      /* 4 Action Question Pills: Styled Exactly like Mockup */
      .bloomie-quick-questions {
        padding: 4px 14px 8px 14px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        flex-shrink: 0;
      }
      .bloomie-pill-btn {
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        border: 1px solid rgba(220, 210, 196, 0.85);
        border-radius: 22px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500; /* Anuphan Medium */
        color: #423B33;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
        outline: none;
        font-family: 'Anuphan', sans-serif;
        text-align: center;
      }
      .bloomie-pill-btn img {
        width: 17px;
        height: 17px;
        flex-shrink: 0;
      }
      .bloomie-pill-btn:hover {
        background: #ffffff;
        border-color: ${THEME.olive};
        color: ${THEME.oliveDark};
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(125, 139, 110, 0.18);
      }

      /* Extra Prompts (Horizontal Scrollable Chips) */
      .bloomie-extra-chips {
        padding: 0 14px 6px 14px;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .bloomie-extra-chips::-webkit-scrollbar {
        height: 3px;
      }
      .bloomie-extra-chips::-webkit-scrollbar-thumb {
        background: rgba(125, 139, 110, 0.25);
        border-radius: 3px;
      }
      .bloomie-mini-chip {
        font-size: 11px;
        background: rgba(255, 255, 255, 0.75);
        color: #554D43;
        border: 1px solid rgba(225, 217, 205, 0.8);
        padding: 4px 10px;
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        font-family: 'Anuphan', sans-serif;
      }
      .bloomie-mini-chip:hover {
        background: ${THEME.olive};
        color: #ffffff;
        border-color: ${THEME.olive};
      }

      /* Input Area: White Pill with Smiley Icon and Olive-Green Circular Send Button */
      .bloomie-input-wrapper {
        margin: 0 14px 14px 14px;
        display: flex;
        align-items: flex-end;
        gap: 8px;
        flex-shrink: 0;
      }
      .bloomie-input-field-pill {
        flex: 1;
        background: #ffffff;
        border: 1.2px solid rgba(220, 210, 196, 0.95);
        border-radius: 24px;
        padding: 8px 14px 8px 14px;
        min-height: 48px;
        max-height: 120px;
        display: flex;
        align-items: flex-end;
        gap: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        transition: border-color 0.2s, box-shadow 0.2s;
        box-sizing: border-box;
      }
      .bloomie-input-field-pill:focus-within {
        border-color: ${THEME.olive};
        box-shadow: 0 0 0 3px rgba(125, 139, 110, 0.15);
      }
      .bloomie-smiley-icon {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        opacity: 0.7;
        transition: opacity 0.2s;
        margin-bottom: 5px;
      }
      .bloomie-input-field-pill:focus-within .bloomie-smiley-icon {
        opacity: 1;
      }
      #pimbot-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 13.5px;
        font-family: 'Anuphan', sans-serif;
        font-weight: 400; /* Anuphan Regular */
        color: ${THEME.textDark};
        background: transparent;
        resize: none;
        max-height: 96px;
        line-height: 1.5;
        padding: 4px 0;
        margin: 0;
        overflow-y: auto;
        box-sizing: border-box;
      }
      #pimbot-input::-webkit-scrollbar {
        width: 4px;
      }
      #pimbot-input::-webkit-scrollbar-thumb {
        background: rgba(125, 139, 110, 0.3);
        border-radius: 4px;
      }
      #pimbot-input::placeholder {
        color: #9E968B;
        font-weight: 300;
      }
      #pimbot-send-btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${THEME.olive};
        color: #ffffff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(125, 139, 110, 0.35);
        transition: transform 0.2s, background-color 0.2s;
        flex-shrink: 0;
        outline: none;
        margin-bottom: 0;
      }
      #pimbot-send-btn img {
        width: 20px;
        height: 20px;
      }
      #pimbot-send-btn:hover {
        background: ${THEME.oliveHover};
        transform: scale(1.06);
      }
      #pimbot-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      /* Typing Indicator */
      .bloomie-typing-wrap {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 10px 14px;
        background: ${THEME.botBubble};
        border-radius: 18px;
        border: 1px solid rgba(230, 222, 210, 0.8);
        width: fit-content;
      }
      .bloomie-dot {
        width: 6px;
        height: 6px;
        background: #A3998C;
        border-radius: 50%;
        animation: bloomieBounce 1.2s infinite ease-in-out;
      }
      .bloomie-dot:nth-child(2) { animation-delay: 0.2s; }
      .bloomie-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes bloomieBounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-5px); }
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "pimbot-root";
    root.innerHTML = `
      <div id="pimbot-window">
        <!-- 1. Header (Olive Green Pill) -->
        <div class="bloomie-header">
          <div class="bloomie-header-left">
            <div class="bloomie-header-avatar" title="Bloomie Florist">
              <img src="images/bloomie-logo.svg" alt="Bloomie Florist Logo">
            </div>
            <div class="bloomie-header-titles">
              <div class="bloomie-header-name">
                Bloomie Florist <span class="heart"></span>
              </div>
              <div class="bloomie-header-sub">
                Let flowers say it for you 
              </div>
            </div>
          </div>
          <div class="bloomie-header-actions">
            <button id="pimbot-clear-btn" class="bloomie-header-btn" title="ล้างประวัติการแชท"></button>
            <button id="pimbot-pin-btn" class="bloomie-header-btn" title="ปักหมุดข้อความ"></button>
            <span class="bloomie-header-sep">|</span>
            <button id="pimbot-close-btn" class="bloomie-header-btn" title="ปิดกล่องข้อความ"></button>
          </div>
        </div>

        <!-- 2. Status Bar (Capsule Pill) -->
        <div class="bloomie-status-bar" id="pimbot-status-bar">
          <span class="bloomie-status-dot" id="pimbot-status-dot"></span>
          <span id="pimbot-status-text">พร้อมให้บริการ</span>
          <span class="bloomie-status-sep">|</span>
          <span> เปิดให้บริการทุกวัน เวลา 09:00 – 20:00 น.</span>
        </div>

        <!-- 3. แถบคำเตือนตามหลักจริยธรรม (Ethical AI Disclaimer) -->
        <div class="bloomie-disclaimer">
          <span>️</span>
          <div>
            ระบบ AI อัจฉริยะ ตอบจากข้อมูลร้าน • ติดต่อพนักงานโทร <a href="tel:${SHOP_PHONE}">${SHOP_PHONE}</a> | LINE: <strong>${SHOP_LINE}</strong>
          </div>
        </div>

        <!-- 4. Messages Container -->
        <div class="bloomie-messages" id="pimbot-messages">
          <div class="bloomie-msg-row bot-row">
            <div class="bloomie-bot-avatar">
              <img src="images/bloomie-logo.svg" alt="Bloomie Avatar">
            </div>
            <div class="bloomie-bubble bot">
              <div class="bloomie-welcome-title">สวัสดีค่ะ! ยินดีต้อนรับสู่ Bloomie Florist </div>
              <div class="bloomie-welcome-desc">
                หนูคือผู้ช่วยจัดดอกไม้ของร้าน พร้อมดูแลทุกท่านด้วยความใส่ใจ ไม่ว่าจะเป็นการสั่งจัดช่อดอกไม้ ช่อดอกไม้วันพิเศษ หรือสอบถามข้อมูลสินค้า หนูยินดีให้บริการค่ะ 
              </div>
              <div class="bloomie-ribbon-divider">
                <span class="bloomie-divider-line"></span>
                <img src="images/icon-ribbon.svg" alt="ribbon" class="bloomie-ribbon-icon">
                <span class="bloomie-divider-line"></span>
              </div>
              <div class="bloomie-welcome-footer">
                 สอบถามข้อมูลเพิ่มเติมได้เลยนะคะ หรือเลือกเมนูด้านล่างได้เลยค่ะ 
              </div>
            </div>
          </div>
        </div>

        <!-- 5. ชุด 4 ไอคอนคำถาม (Quick Action Questions) -->
        <div class="bloomie-quick-questions" id="bloomie-quick-questions"></div>

        <!-- 6. คำแนะนำเสริมการเจนภาพด้วย AI -->
        <div class="bloomie-extra-chips" id="bloomie-extra-chips"></div>

        <!-- 7. Input Pill + Olive Green Send Button -->
        <div class="bloomie-input-wrapper">
          <div class="bloomie-input-field-pill">
            <img src="images/icon-smiley.svg" alt="smiley" class="bloomie-smiley-icon">
            <textarea id="pimbot-input" rows="1" placeholder="พิมพ์ข้อความที่นี่... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)" autocomplete="off"></textarea>
          </div>
          <button id="pimbot-send-btn" title="ส่งข้อความ">
            <img src="images/icon-plane.svg" alt="ส่ง">
          </button>
        </div>
      </div>

      <!-- Floating Open/Close Button -->
      <button id="pimbot-toggle-btn" title="แชทกับ Bloomie Florist">
        <span class="bloomie-pulse-badge"></span>
        <img src="images/bloomie-logo.svg" alt="Bloomie Logo" class="bloomie-toggle-icon">
      </button>
    `;
    document.body.appendChild(root);

    // สร้างปุ่ม 4 ไอคอนคำถาม
    const qContainer = document.getElementById("bloomie-quick-questions");
    QUICK_QUESTIONS.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "bloomie-pill-btn";
      btn.innerHTML = `<img src="${item.icon}" alt="${item.text}"><span>${item.text}</span>`;
      btn.onclick = () => {
        document.getElementById("pimbot-input").value = item.query;
        handleSendMessage();
      };
      qContainer.appendChild(btn);
    });

    // สร้างชิปเสริมสำหรับ AI เจนภาพ
    const chipsContainer = document.getElementById("bloomie-extra-chips");
    EXTRA_AI_PROMPTS.forEach(promptText => {
      const chip = document.createElement("button");
      chip.className = "bloomie-mini-chip";
      chip.textContent = promptText;
      chip.onclick = () => {
        if (promptText.includes("เปิดสตูดิโอ")) {
          const visualizerSection = document.getElementById("visualizer");
          if (visualizerSection) visualizerSection.scrollIntoView({ behavior: 'smooth' });
          addBotMessage("หนูเปิดสตูดิโอจำลองช่อดอกไม้และการ์ดอวยพรให้แล้วค่ะ คุณลูกค้าสามารถเลือกดอกไม้จริงและพิมพ์ข้อความการ์ดได้ที่หน้าเว็บเลยนะคะ ");
        } else {
          document.getElementById("pimbot-input").value = promptText;
          handleSendMessage();
        }
      };
      chipsContainer.appendChild(chip);
    });

    // ผูก Event Listeners
    const toggleBtn = document.getElementById("pimbot-toggle-btn");
    const closeBtn = document.getElementById("pimbot-close-btn");
    const clearBtn = document.getElementById("pimbot-clear-btn");
    const pinBtn = document.getElementById("pimbot-pin-btn");
    const sendBtn = document.getElementById("pimbot-send-btn");
    const input = document.getElementById("pimbot-input");

    toggleBtn.onclick = toggleChatWindow;
    closeBtn.onclick = toggleChatWindow;
    clearBtn.onclick = clearChatHistory;
    if (pinBtn) {
      pinBtn.onclick = () => {
        addBotMessage(" ปักหมุดกล่องแชท Bloomie Florist ไว้กับหน้าจอเรียบร้อยค่ะ ลูกค้าสามารถเลื่อนชมสินค้าพร้อมแชทไปพร้อมกันได้เลยนะคะ ");
      };
    }
    sendBtn.onclick = handleSendMessage;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    // ปรับความสูง textarea อัตโนมัติเมื่อข้อความยาวเกินบรรทัด
    input.addEventListener("input", () => {
      input.style.height = "auto";
      const newHeight = Math.min(input.scrollHeight, 96);
      input.style.height = (newHeight > 24 ? newHeight : 24) + "px";
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

  // คีย์สำหรับเก็บประวัติใน LocalStorage พร้อมอายุ 1 ชั่วโมง (Grab Style)
  const STORAGE_KEY = "bloomie_chat_session_v1";
  const CHAT_TTL_MS = 60 * 60 * 1000; // 1 ชั่วโมง (3,600,000 มิลลิวินาที)

  function loadSavedChatHistory() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const now = Date.now();
      // ตรวจสอบว่าเกิน 1 ชั่วโมงหรือยัง
      if (now - (parsed.lastUpdated || 0) > CHAT_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (Array.isArray(parsed.history)) {
        systemState.history = parsed.history;
      }
      if (parsed.html) {
        const msgs = document.getElementById("pimbot-messages");
        if (msgs) {
          msgs.innerHTML = parsed.html;
          msgs.scrollTop = msgs.scrollHeight;
        }
      }
    } catch (e) {
      console.warn("โหลดประวัติแชทไม่สำเร็จ:", e);
    }
  }

  function saveChatSession() {
    try {
      const msgs = document.getElementById("pimbot-messages");
      if (!msgs) return;
      const data = {
        lastUpdated: Date.now(),
        history: systemState.history || [],
        html: msgs.innerHTML
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("บันทึกประวัติแชทไม่สำเร็จ:", e);
    }
  }

  function clearChatHistory() {
    systemState.history = [];
    localStorage.removeItem(STORAGE_KEY);
    const msgs = document.getElementById("pimbot-messages");
    msgs.innerHTML = `
      <div class="bloomie-msg-row bot-row">
        <div class="bloomie-bot-avatar">
          <img src="images/bloomie-logo.svg" alt="Bloomie Avatar">
        </div>
        <div class="bloomie-bubble bot">
          <div class="bloomie-welcome-title">ล้างประวัติการสนทนาเรียบร้อยค่ะ </div>
          <p class="bloomie-welcome-desc">มีอะไรให้ Bloomie Florist ดูแลเรื่องดอกไม้สดหรือของขวัญเพิ่มเติมไหมคะ? ยินดีให้บริการเสมอนะคะ </p>
        </div>
      </div>
    `;
  }

  function addUserMessage(text) {
    const msgs = document.getElementById("pimbot-messages");
    const row = document.createElement("div");
    row.className = "bloomie-msg-row user-row";
    row.innerHTML = `<div class="bloomie-bubble user">${escapeHtml(text)}</div>`;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
    saveChatSession();
  }

  function addBotMessage(text, citation = null, imageInfo = null) {
    const msgs = document.getElementById("pimbot-messages");
    const row = document.createElement("div");
    row.className = "bloomie-msg-row bot-row";

    let formattedText = formatMarkdown(text);
    let html = `
      <div class="bloomie-bot-avatar">
        <img src="images/bloomie-logo.svg" alt="Bloomie Avatar">
      </div>
      <div class="bloomie-bubble bot">
        <div>${formattedText}</div>
    `;

    if (citation) {
      html += `<div class="bloomie-citation"> อ้างอิง: <strong>${citation.file}</strong> (ส่วนที่ ${citation.chunkIndex}, ความสอดคล้อง ${citation.scorePercent}%)</div>`;
    }

    // แทรกการ์ดรูปภาพ AI ถ้ามี
    if (imageInfo && imageInfo.url) {
      const cardId = "ai-img-" + Math.floor(Math.random() * 100000);
      html += `
        <div class="bloomie-ai-card">
          <div class="bloomie-ai-card-header">
            <span> ภาพจำลองจาก AI เสมือนจริง</span>
            <span>Bloomie Studio</span>
          </div>
          <div class="bloomie-ai-card-img-wrap" id="${cardId}-wrap">
            <div class="bloomie-ai-shimmer" id="${cardId}-shimmer">
              <span></span>
              <span>กำลังเรนเดอร์ภาพช่อดอกไม้...</span>
            </div>
            <img src="${imageInfo.url}" alt="AI Flower Bouquet" 
                 onload="document.getElementById('${cardId}-shimmer').style.display='none'"
                 onerror="this.src='images/rose-red.jpg'; document.getElementById('${cardId}-shimmer').style.display='none'" />
          </div>
          <div class="bloomie-ai-card-actions">
            <a href="${imageInfo.url}" target="_blank" download="Bloomie-Bouquet.jpg" class="bloomie-ai-btn">
               ดาวน์โหลดรูปภาพ
            </a>
            <button class="bloomie-ai-btn" onclick="applyAIToStudio('${imageInfo.url}')">
               ใส่การ์ดในสตูดิโอ
            </button>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    row.innerHTML = html;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
    saveChatSession();
  }

  function showTypingIndicator() {
    const msgs = document.getElementById("pimbot-messages");
    const typing = document.createElement("div");
    typing.id = "pimbot-typing";
    typing.className = "bloomie-msg-row bot-row";
    typing.innerHTML = `
      <div class="bloomie-bot-avatar">
        <img src="images/bloomie-logo.svg" alt="Bloomie Avatar">
      </div>
      <div class="bloomie-typing-wrap">
        <div class="bloomie-dot"></div>
        <div class="bloomie-dot"></div>
        <div class="bloomie-dot"></div>
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
      dot.style.background = isError ? "#ef4444" : "#52B788";
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
  // 4. ลำดับการทำงานช่วงที่ 1 : เตรียมระบบ RAG
  // -------------------------------------------------------------
  async function initializeRAGSystem() {
    try {
      if (typeof CONFIG === "undefined") {
        updateStatusBar("ข้อผิดพลาด: ไม่พบไฟล์ config.js", true);
        return;
      }

      systemState.workerUrl = CONFIG.WORKER_URL || "";
      systemState.mode = CONFIG.SEARCH_MODE || "local";
      systemState.model = CONFIG.MODEL || "openai/gpt-4o-mini";
      const files = CONFIG.FILES || [];
      const docsBase = CONFIG.DOCS_BASE || "docs";
      const chunkSize = CONFIG.CHUNK_SIZE || 500;
      const overlap = CONFIG.OVERLAP || 100;

      systemState.totalFiles = files.length;
      updateStatusBar(`กำลังโหลดข้อมูล ${files.length} ไฟล์...`);

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
        updateStatusBar("กำลังโหลดดัชนีเวกเตอร์...");
        try {
          const vRes = await fetch("vectors.json");
          if (!vRes.ok) throw new Error("ไม่พบไฟล์ vectors.json");
          const vData = await vRes.json();
          if (Array.isArray(vData) && vData.length > 0) {
            systemState.vectors = vData;
          } else {
            throw new Error("โครงสร้าง vectors.json ว่างเปล่า");
          }
        } catch (vErr) {
          console.warn("โหลดเวกเตอร์ล้มเหลว สลับเป็น Local Search อัตโนมัติ:", vErr.message);
          systemState.mode = "local";
        }
      }

      systemState.isReady = true;
      updateStatusBar("พร้อมให้บริการ");
      loadSavedChatHistory(); // โหลดประวัติแชทเก่าที่ยังไม่หมดอายุ 1 ชม. (Grab Style)

    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการเริ่มระบบ RAG:", err);
      updateStatusBar("เตรียมระบบไม่สำเร็จ", true);
    }
  }

  // -------------------------------------------------------------
  // 5. ลำดับการทำงานช่วงที่ 2 : ค้นคืนเอกสาร (Retrieval)
  // -------------------------------------------------------------
  function retrieveLocalChunks(query, topK = 5) {
    const qTokens = tokenizeText(query);
    const qLower = (query || "").toLowerCase();

    // รายการคำสำคัญเฉพาะ (Entity Keywords) สำหรับช่วยบูสต์ความแม่นยำข้ามไฟล์
    const entityKeywords = [
      "ลิลลี่เอเชียติก", "ลิลลี่โอเรียนทอล", "ลิลลี่", "เอเชียติก", "โอเรียนทอล",
      "กุหลาบเอกวาดอร์", "กุหลาบฮอลแลนด์", "กุหลาบเคนยา", "กุหลาบจีน", "กุหลาบไทย", "กุหลาบ",
      "ทานตะวัน", "ไฮเดรนเยีย", "ทิวลิป", "เยอบีร่า", "คาร์เนชั่น", "เบญจมาศ", "มัม", "มัมปิงปอง",
      "กล้วยไม้", "ฟาแลนนอปซิส", "พีโอนี", "โบตั๋น", "ลิเซียนทัส", "รานังคูลัส", "คาลล่าลิลลี่",
      "ยิปโซ", "แคสเปีย", "สแตติส", "แว็กซ์", "เดซี่", "คัตเตอร์", "ยูคาลิปตัส",
      "กระดาษฟิล์มใส", "ฟิล์มใส", "กระดาษใส", "opp", "กระดาษเกาหลี", "ฟิล์มด้าน",
      "กระดาษคราฟท์", "กระดาษไข", "กระดาษสา", "กระดาษสโนว์", "ผ้าตาข่าย",
      "ริบบิ้นผ้าซาติน", "ซาติน", "ชีฟอง", "organza", "กำมะหยี่", "โบว์"
    ];

    const detected = entityKeywords.filter(k => qLower.includes(k));

    const scored = systemState.chunks.map(chunk => {
      let score = 0;
      for (const t of qTokens) {
        if (chunk.tokens.has(t)) {
          score += (t.length >= 4 ? 3 : (t.length >= 2 ? 1 : 0.5));
        }
      }

      // บูสต์คะแนนสูงเป็นพิเศษหากชิ้นเอกสารมีคำสำคัญตรงกับที่ลูกค้าถาม
      const chunkTextLower = chunk.text.toLowerCase();
      for (const e of detected) {
        if (chunkTextLower.includes(e)) {
          score += 45;
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
  // 6. การประกอบคำสั่ง (Prompt Assembly) & กติกาสามข้อ
  // -------------------------------------------------------------
  function makePrompt(topChunks, userQuestion) {
    // รวบรวมเอกสารทั้งหมดของร้าน (Full Knowledge Base)
    let fullKnowledgeText = "";
    if (systemState.rawDocs && Object.keys(systemState.rawDocs).length > 0) {
      fullKnowledgeText = Object.entries(systemState.rawDocs)
        .map(([fname, text]) => `=== ข้อมูลส่วน: ${fname} ===\n${text}`)
        .join("\n\n");
    } else {
      fullKnowledgeText = topChunks.map(c => 
        `[ส่วนที่ ${c.chunkIndex} จาก ${c.file}]\n${c.text}`
      ).join("\n\n");
    }

    return `คุณคือ "น้องบลูมมี่" ฟลอริสต์และผู้เชี่ยวชาญด้านการจัดดอกไม้ตัวจริงของร้าน Bloomie Florist
ให้พูดคุยและตอบลูกค้าด้วยน้ำเสียงที่เป็นมิตร อบอุ่น นุ่มนวล ใส่ใจ เหมือนคนจัดดอกไม้ตัวจริงกำลังดูแลลูกค้าหน้าร้านอย่างน่ารักและเป็นกันเอง

กฎสำคัญในการสื่อสารแบบมืออาชีพ:
1. การสนทนาต่อเนื่อง (Multi-turn Context): จดจำบทสนทนาก่อนหน้าเสมอ! หากลูกค้าถามคำถามต่อเนื่อง (เช่น "มีดอกไม้แบบอื่นแนะนำไหม", "แล้วถ้าเปลี่ยนสีกระดาษล่ะ", "ราคาเท่าไหร่") ให้ตอบเชื่อมโยงกับเรื่องที่เพิ่งคุยค้างไว้ ไม่ต้องทักทายสวัสดีใหม่เหมือนเริ่มคุยครั้งแรก และห้ามแนะนำดอกไม้เดิมซ้ำ
2. ห้ามพูดคำว่า "จากคลังเอกสารของร้าน", "ตามเอกสาร", "จากข้อมูลในเอกสาร", "ตามไฟล์" หรือคำแนวระบบคอมพิวเตอร์เด็ดขาด! ให้พูดแนะนำอย่างเป็นธรรมชาติ เช่น "สำหรับวันรับปริญญา ทางร้านขอแนะนำเป็น...", "ดอกไม้ยอดนิยมของที่ร้านจะมี...", "ตัวนี้ที่ร้านมีพร้อมจัดเลยค่ะ"
3. บุคลิกและการใช้คำ: ใช้คำลงท้าย "ค่ะ/นะคะ" อย่างสุภาพอ่อนหวาน ไม่ใช้คำว่า "ค่ะ/ครับ" ปนกัน ไม่พูดทางการแข็งทื่อเหมือนอ่านรายงานวิชาการ
4. ยึดข้อมูลจริงของร้านเท่านั้น (Grounding): แนะนำเฉพาะดอกไม้ วัสดุห่อ ราคา และนโยบายที่มีอยู่ในร้านเท่านั้น ห้ามแต่งเรื่องหรือมั่วราคา
5. การแจกแจงราคา: ถ้าลูกค้าถามราคาหรือสั่งจัดช่อหลายอย่าง ให้แจกแจงสั้นๆ อ่านง่าย สรุปยอดรวมชัดเจน พร้อมแนะนำโทนสีหรือกระดาษห่อที่เข้ากันอย่างน่ารัก
6. กรณีไม่มีข้อมูล: หากลูกค้าถามเรื่องนอกร้าน (เช่น หอพัก, บิตคอยน์) ให้บอกปัดอย่างน่ารักและสุภาพ เช่น "ขออภัยด้วยนะคะ พอดีทางร้าน Bloomie Florist ดูแลเฉพาะเรื่องดอกไม้สดและของขวัญเป็นหลักค่ะ หากมีเรื่องดอกไม้ช่อไหนให้หนูช่วยดูแล สอบถามได้เลยนะคะ หรือโทรสอบถามพี่ๆ พนักงานได้ที่เบอร์ ${SHOP_PHONE} ค่ะ"

ข้อมูลดอกไม้และบริการของร้าน Bloomie Florist:
${fullKnowledgeText}`;
  }

  // -------------------------------------------------------------
  // 7. การส่งคำสั่งไปให้ AI เรียบเรียงคำตอบ (Generation)
  // -------------------------------------------------------------
  async function callAI(systemPrompt, userQuestion, topChunks) {
    const workerUrl = systemState.workerUrl;
    const directKey = (typeof CONFIG !== "undefined" && CONFIG.KEY) ? CONFIG.KEY.trim() : "";

    // 1. ถ้าระบุ Google Gemini API Key โดยตรง (ขึ้นต้นด้วย AIzaSy หรือ AQ...)
    if (directKey && (directKey.startsWith("AIzaSy") || directKey.startsWith("AQ."))) {
      try {
        const geminiModel = (systemState.model && !systemState.model.includes("/")) 
          ? systemState.model 
          : "gemini-2.5-flash";
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${directKey}`;

        // จัดเตรียมประวัติการสนทนาส่งให้ Gemini (Multi-turn History)
        const contents = [];
        const recentHistory = (systemState.history || []).slice(-6); // เอา 3 คู่ล่าสุด
        for (const h of recentHistory) {
          contents.push({
            role: h.role === "user" ? "user" : "model",
            parts: [{ text: h.text }]
          });
        }
        contents.push({
          role: "user",
          parts: [{ text: userQuestion }]
        });

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: contents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1000
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply) {
            // บันทึกประวัติ
            systemState.history.push({ role: "user", text: userQuestion });
            systemState.history.push({ role: "model", text: reply });
            return reply;
          }
        } else {
          console.warn("ยิงตรง Google Gemini ล้มเหลว:", response.status, await response.text());
        }
      } catch (geminiErr) {
        console.warn("Direct Google Gemini Error:", geminiErr.message);
      }
    }

    // 2. ถ้าระบุ OpenRouter Key โดยตรงใน config.js
    if (directKey && directKey.startsWith("sk-or-v1-")) {
      try {
        const messages = [
          { role: "system", content: systemPrompt }
        ];
        const recentHistory = (systemState.history || []).slice(-6);
        for (const h of recentHistory) {
          messages.push({
            role: h.role === "user" ? "user" : "assistant",
            content: h.text
          });
        }
        messages.push({ role: "user", content: userQuestion });

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${directKey}`,
            "HTTP-Referer": window.location.origin || "http://localhost:8000",
            "X-Title": "Bloomie Florist Chatbot"
          },
          body: JSON.stringify({
            model: systemState.model || "openai/gpt-4o-mini",
            messages: messages,
            temperature: 0.3,
            max_tokens: 800
          })
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            systemState.history.push({ role: "user", text: userQuestion });
            systemState.history.push({ role: "model", text: reply });
            return reply;
          }
        } else {
          console.warn("ยิงตรง OpenRouter ล้มเหลว:", response.status, await response.text());
        }
      } catch (directErr) {
        console.warn("Direct OpenRouter Error:", directErr.message);
      }
    }

    // 2. ถ้ามี Worker URL ให้ลองยิงผ่าน Worker Proxy
    if (workerUrl && !workerUrl.includes("your-account") && !workerUrl.includes("example.workers.dev")) {
      try {
        const response = await fetch(`${workerUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: systemState.model,
            messages: [
              { role: "system", content: "คุณคือนักจัดดอกไม้และผู้ช่วยตอบคำถามของร้าน Bloomie Florist" },
              { role: "user", content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 800
          })
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) return reply;
        }
      } catch (workerErr) {
        console.warn("ส่งคำขอผ่าน Worker ไม่สำเร็จ กำลังใช้ระบบ Local Answer:", workerErr.message);
      }
    }

    return generateSmartLocalAnswer(userQuestion, topChunks);
  }

  function generateSmartLocalAnswer(question, chunks) {
    const q = question.toLowerCase();

    // กฎปฏิเสธเรื่องที่ไม่มีในเอกสาร (กติกาสามข้อ)
    const irrelevantKeywords = ["หอพัก", "ค่าเช่า", "วิชา", "ลงทะเบียน", "เกรด", "อาจารย์", "สอบ", "บิทคอยน์", "หุ้น"];
    if (irrelevantKeywords.some(k => q.includes(k))) {
      return `ไม่พบข้อมูลนี้ในเอกสารของร้าน Bloomie Florist ค่ะ\n(ร้านของเราให้บริการเฉพาะดอกไม้สด ช่อดอกไม้ และของขวัญ หากมีคำถามอื่นๆ สามารถติดต่อสอบถามเจ้าหน้าที่ได้ที่เบอร์ ${SHOP_PHONE} หรือ LINE: ${SHOP_LINE} ค่ะ)`;
    }

    // เจาะจง: ถามราคากระดาษห่อ / ริบบิ้น
    if (q.includes("กระดาษ") || q.includes("ห่อ") || q.includes("ริบบิ้น") || q.includes("โบว์")) {
      let matInfo = "ราคาวัสดุห่อช่อและตกแต่งของ Bloomie Florist มีรายละเอียดดังนี้ค่ะ:\n\n";
      if (q.includes("เกาหลี") || q.includes("ฟิล์ม")) {
        matInfo += "• **กระดาษฟิล์มด้านสไตล์เกาหลี (Korean Matte Film):** 100 บาท/ช่อ (กันน้ำ 100% สไตล์มินิมอลยอดนิยม มีสีขาวมุก ชมพูพาสเทล ชานม ฟ้าพาสเทล เขียวเซจ ดำด้าน เทาหมอก ช็อกโกแลต)\n";
      }
      if (q.includes("คราฟท์") || q.includes("คราฟ") || q.includes("kraft")) {
        matInfo += "• **กระดาษคราฟท์ธรรมชาติ (Kraft Paper):** 80 บาท/ช่อ (สไตล์วินเทจ มินิมอล รักษ์โลก ย่อยสลายได้)\n";
      }
      if (q.includes("ไข") || q.includes("tracing")) {
        matInfo += "• **กระดาษไขโปร่งแสง (Tracing / Vellum Paper):** 90 บาท/ช่อ (โปร่งแสง ละมุนตา ซ้อนเลเยอร์สวยงาม)\n";
      }
      if (q.includes("ใส") || q.includes("opp") || q.includes("เซลโลเฟน")) {
        matInfo += "• **กระดาษแก้วใส / OPP เคลือบใส:** 80 บาท/ช่อ (มองเห็นดอกไม้ชัดเจน 360 องศา กันน้ำ)\n";
      }
      if (q.includes("สา") || q.includes("มัลเบอร์รี่") || q.includes("mulberry")) {
        matInfo += "• **กระดาษสาสานมือ / Mulberry Paper:** 120 บาท/ช่อ (เส้นใยธรรมชาติ สไตล์ญี่ปุ่น วาบิ-ซาบิ)\n";
      }
      if (q.includes("ริบบิ้น") || q.includes("โบว์")) {
        matInfo += "• **ริบบิ้นผ้าซาตินพรีเมียม (Satin Ribbon):** ฟรี (รวมในบริการจัดช่อทุกช่อ)\n" +
                   "• **ริบบิ้นผ้าชีฟองขอบรุ่ย (Frayed Chiffon Ribbon):** +40 บาท/ช่อ\n" +
                   "• **ริบบิ้นผ้าโปร่ง Organza:** +30 บาท/ช่อ\n" +
                   "• **ริบบิ้นกำมะหยี่ (Velvet Ribbon):** +50 บาท/ช่อ\n";
      }
      if (!q.includes("เกาหลี") && !q.includes("คราฟ") && !q.includes("ไข") && !q.includes("ใส") && !q.includes("สา") && !q.includes("ริบบิ้น") && !q.includes("โบว์")) {
        matInfo += "• **กระดาษฟิล์มด้านสไตล์เกาหลี:** 100 บาท/ช่อ\n" +
                   "• **กระดาษคราฟท์ธรรมชาติ:** 80 บาท/ช่อ\n" +
                   "• **กระดาษไขโปร่งแสง:** 90 บาท/ช่อ\n" +
                   "• **กระดาษแก้วใส OPP:** 80 บาท/ช่อ\n" +
                   "• **กระดาษสาสานมือ Mulberry:** 120 บาท/ช่อ\n" +
                   "• **ริบบิ้นผ้าซาติน:** ฟรีทุกช่อ (ริบบิ้นชีฟอง +40฿, กำมะหยี่ +50฿)\n";
      }
      return matInfo;
    }

    // เจาะจง: ถามราคาดอกกุหลาบ
    if (q.includes("กุหลาบ") && (q.includes("ราคา") || q.includes("เท่าไหร่") || q.includes("เท่าไร") || q.includes("กี่บาท") || q.includes("พันธุ์"))) {
      return `ราคาดอกกุหลาบสดของ **Bloomie Florist** มีให้เลือกครบทั้ง 5 สายพันธุ์ดังนี้ค่ะ:\n\n` +
        `1. **กุหลาบเอกวาดอร์ (Ecuadorian Rose):** ดอกละ 180 บาท (สั่งเป็นกำ 10 ดอก ราคา 1,600 บาท) - ดอกใหญ่พิเศษ กลีบหนา บานทน 7-10 วัน\n` +
        `2. **กุหลาบฮอลแลนด์ (Dutch Rose):** ดอกละ 120 บาท (สั่งเป็นกำ 10 ดอก ราคา 1,100 บาท) - ทรงคลาสสิก สีสดชัด บานทน 5-7 วัน\n` +
        `3. **กุหลาบเคนยา (Kenyan Rose):** ดอกละ 90 บาท (สั่งเป็นกำ 10 ดอก ราคา 800 บาท) - ดอกกะทัดรัด ก้านแข็งแรง สีสดสวย\n` +
        `4. **กุหลาบจีนคัดเกรด (Chinese Rose):** ดอกละ 70 บาท (สั่งเป็นกำ 10 ดอก ราคา 600 บาท) - บานเต็มฟอร์ม คุ้มค่าราคาประหยัด\n` +
        `5. **กุหลาบไทยเชียงใหม่เกรด A (Thai Rose):** ดอกละ 50 บาท (สั่งเป็นกำ 10 ดอก ราคา 450 บาท) - ดอกสดใหม่ทุกวันจากโครงการหลวง\n\n` +
        `*ลูกค้าสามารถเลือกจำนวนดอกและนำมาจัดช่อพร้อมเลือกสีกระดาษและริบบิ้นได้ตามใจชอบเลยค่ะ!*`;
    }

    // เจาะจง: ถามราคาดอกไม้อื่นๆ เฉพาะชนิด
    if (q.includes("ทิวลิป") && (q.includes("ราคา") || q.includes("เท่าไหร่") || q.includes("เท่าไร"))) {
      return `ราคาดอกทิวลิปเนเธอร์แลนด์ (Dutch Tulip) ของทางร้าน:\n• **ดอกทิวลิปนำเข้าเกรด A:** 110 บาท/ดอก ค่ะ`;
    }
    if (q.includes("ทานตะวัน") && (q.includes("ราคา") || q.includes("เท่าไหร่") || q.includes("เท่าไร"))) {
      return `ราคาดอกทานตะวันของทางร้าน:\n• **ดอกทานตะวันซันนี่ (Sunny Sunflower เกรด A หน้าดอก 12-15 ซม.):** 90 บาท/ดอก ค่ะ`;
    }
    if (q.includes("ไฮเดรนเยีย") && (q.includes("ราคา") || q.includes("เท่าไหร่") || q.includes("เท่าไร"))) {
      return `ราคาดอกไฮเดรนเยียของทางร้าน:\n• **ไฮเดรนเยียฮอลแลนด์/ญี่ปุ่น (หัวทรงบอลใหญ่ 18-22 ซม.):** 350 บาท/หัว ค่ะ`;
    }
    if (q.includes("ลิลลี่") && (q.includes("ราคา") || q.includes("เท่าไหร่") || q.includes("เท่าไร"))) {
      return `ราคาดอกลิลลี่ของทางร้าน:\n• **ลิลลี่ออเรียนทัล (Oriental Lily มีกลิ่นหอม ช่อละ 3-5 ดอกตูม/บาน):** 220 บาท/ก้าน\n• **ลิลลี่เอเชียติก (Asiatic Lily สีสด ไม่มีกลิ่น):** 160 บาท/ก้าน ค่ะ`;
    }

    // 1. หมวดคำถาม: สั่งล่วงหน้าได้ไหม?
    if (q.includes("ล่วงหน้า") || q.includes("จองกี่วัน") || q.includes("สั่งกี่วัน")) {
      return `สำหรับการสั่งจัดช่อดอกไม้ที่ **Bloomie Florist** มีรายละเอียดดังนี้ค่ะ:\n\n` +
        `• **ช่อดอกไม้สดมาตรฐาน:** แนะนำสั่งจองล่วงหน้าอย่างน้อย **1 วัน** เพื่อให้ทางร้านคัดสรรดอกไม้ที่สดและสวยที่สุดค่ะ\n` +
        `• **ช่อดอกไม้นำเข้าพิเศษ / ช่อรับปริญญาขนาดใหญ่:** สั่งจองล่วงหน้า **2 - 3 วันทำการ** ค่ะ\n` +
        `• **กรณีต้องการดอกไม้ด่วนวันเดียวกัน (Same-Day):** สามารถสั่งซื้อดอกไม้ที่มีสต็อกหน้าร้านได้เลยค่ะ ใช้เวลาจัดช่อประมาณ **45 - 60 นาที** หลังยืนยันชำระเงิน โทรสอบถามสต็อกดอกไม้สดประจำวันได้ที่ ${SHOP_PHONE} ค่ะ`;
    }

    // 2. หมวดคำถาม: จัดส่งกี่วัน?
    if (q.includes("จัดส่งกี่วัน") || q.includes("ส่งกี่วัน") || (q.includes("จัดส่ง") && q.includes("วัน")) || q.includes("ส่งด่วน")) {
      return `บริการจัดส่งของ **Bloomie Florist** รวดเร็วและดูแลดอกไม้ด้วยความใส่ใจค่ะ:\n\n` +
        `• **บริการส่งด่วนในวันเดียวกัน (Same-Day Delivery):** จัดส่งถึงมือผู้รับภายใน **2 - 3 ชั่วโมง** ในพื้นที่กรุงเทพฯ และปริมณฑล หรือสามารถระบุวันและเวลานัดหมายล่วงหน้าได้ตามต้องการค่ะ\n` +
        `• **จัดส่งฟรี:** ภายในมหาวิทยาลัย PIM และพื้นที่ใกล้เคียงไม่เกิน 3 กม. เมื่อมียอดสั่งซื้อ 500 บาทขึ้นไป\n` +
        `• **รถยนต์ปรับอากาศควบคุมอุณหภูมิ:** เหมาจ่าย 250 บาทต่อเที่ยว เพื่อรักษาความสดชื่นและทรงช่อให้สวยสมบูรณ์แบบที่สุด หรือจัดส่งผ่าน GrabExpress / Lalamove ตามระยะทางจริงค่ะ`;
    }

    // 3. หมวดคำถาม: ราคาเท่าไหร่? (ถามราคารวม / แพ็กเกจช่อ)
    if (q.includes("ราคาเท่าไหร่") || q.includes("ราคาเท่าไร") || q.includes("ราคาช่อ") || q.includes("คิดราคา") || q.includes("ราคา")) {
      return `ราคาช่อดอกไม้สำเร็จรูปของ **Bloomie Florist** มีให้เลือกตามขนาดและประเภทดอกไม้ดังนี้ค่ะ:\n\n` +
        `• **Mini Cute:** เริ่มต้น **390 - 450 บาท** (ช่อทานตะวันซันนี่ 1 ดอก หรือกุหลาบไทยเกรด A 3 ดอก ห่อกระดาษคราฟท์)\n` +
        `• **Sweet Delight (ยอดนิยม):** **590 - 890 บาท** (ช่อทานตะวัน 3 ดอก หรือกุหลาบฮอลแลนด์/ทิวลิปเนเธอร์แลนด์ 3-5 ดอก ห่อกระดาษไขเกาหลีสีครีมน้ำตาล)\n` +
        `• **Elegance & Luxury:** **1,290 - 2,500+ บาท** (ช่อกุหลาบเอกวาดอร์พรีเมียม 10 ดอก หรือไฮเดรนเยียทรงบอลใหญ่ ผูกริบบิ้นซาตินพรีเมียม)\n\n` +
        `*ทุกช่อแถมฟรี การ์ดอวยพรเขียนข้อความพิเศษ และผูกโบว์ริบบิ้นผ้าซาตินพรีเมียมให้ฟรีทุกช่อค่ะ! หากต้องการทราบราคาดอกไม้สดแยกดอก สามารถระบุชื่อดอกไม้เพื่อเช็กราคาได้เลยนะคะ*`;
    }

    // 4. หมวดคำถาม: มีบริการอะไรบ้าง?
    if (q.includes("บริการอะไร") || q.includes("ทำอะไรได้บ้าง") || q.includes("มีอะไรบ้าง")) {
      return `**Bloomie Florist** ยินดีให้บริการครบวงจรด้วยความประณีตค่ะ:\n\n` +
        `1. **จัดช่อดอกไม้สดตามสั่ง:** คัดสรรดอกไม้เกรดพรีเมียม ทั้งกุหลาบเอกวาดอร์, ทิวลิปเนเธอร์แลนด์, ทานตะวัน, ไฮเดรนเยีย, ลิลลี่\n` +
        `2. **ช่อดอกไม้สำหรับทุกโอกาสพิเศษ:** งานรับปริญญา, วันเกิด, วันครบรอบ, ขอแสดงความยินดี, วาเลนไทน์\n` +
        `3.  **การ์ดอวยพรพิเศษ:** บริการพิมพ์ข้อความหรือเขียนการ์ดอวยพรจากใจส่งมอบความรู้สึกถึงคนสำคัญ\n` +
        `4.  **บริการจัดส่งด่วน Same-Day:** รถปรับอากาศควบคุมอุณหภูมิ ดูแลช่อดอกไม้ไม่ให้ช้ำ\n` +
        `5.  **ระบบ AI ออกแบบ & เจนภาพช่อดอกไม้เสมือนจริง:** ให้คุณลูกค้าเลือกผสมดอกไม้ สีกระดาษ และโบว์ แล้วให้ AI เรนเดอร์ภาพตัวอย่างให้ชมได้ทันทีค่ะ!`;
    }

    // กรณีขอภาพ หรือให้ AI เจนภาพ หรือระบุสเปกช่อดอกไม้
    if (checkImageIntent(q)) {
      if (q.includes("กุหลาบ") && q.includes("ทิวลิป")) {
        return `หนูได้ใช้โมเดล **GPT** วิเคราะห์และออกแบบ **ช่อดอกไม้ผสมกุหลาบและทิวลิป** ให้ตามที่คุณต้องการเรียบร้อยแล้วค่ะ \n\n` +
          `** รายละเอียดและราคาจากเอกสารของร้าน Bloomie Florist:**\n` +
          `-  **ดอกกุหลาบ:** กุหลาบฮอลแลนด์ (ดอกละ 120 บาท) หรือกุหลาบเอกวาดอร์พรีเมียม (ดอกละ 180 บาท)\n` +
          `-  **ดอกทิวลิปเนเธอร์แลนด์:** ดอกละ 100 บาท (ทรงถ้วยสวยงาม โมเดิร์นมินิมอล)\n` +
          `-  **กระดาษห่อ:** กระดาษไขเกาหลีสีน้ำตาลครีมกันน้ำ (100 บาท) ห่อจับจีบสองชั้นสไตล์เกาหลี\n` +
          `-  **โบว์ริบบิ้น:** ริบบิ้นผ้าซาตินสีขาวบริสุทธิ์ (บริการผูกให้ฟรี)\n` +
          `- ️ **ดอกแซม:** แนะนำยิปโซขาวเพิ่มความฟูละมุน\n\n` +
          ` *ประเมินราคาเซตนี้ (กุหลาบ 3 ดอก + ทิวลิป 3 ดอก + ห่อกระดาษเกาหลีสีน้ำตาลครีม): ประมาณ **760 - 940 บาท** ค่ะ*\n\n` +
          `️ **ภาพจำลองช่อดอกไม้จริงที่เจนด้วย AI แสดงอยู่ด้านล่างนี้แล้วนะคะ สามารถกดดาวน์โหลดหรือนำไปใส่การ์ดในสตูดิโอได้เลยค่ะ!**`;
      } else if (q.includes("กุหลาบแดง") || q.includes("rose")) {
        return `นี่คือภาพจำลองช่อ **กุหลาบเอกวาดอร์แดงการ์เนต** พรีเมียมของร้านค่ะ \n- **ราคา:** ดอกละ 180 บาท หรือกำละ 1,600 บาท (10 ดอก) กลีบหนาพิเศษ บานทน 7-10 วัน\n- **ความหมาย:** สื่อถึงรักแท้ที่มั่นคง ลึกซึ้ง และความหลงใหลตลอดกาล\n- ห่อด้วยกระดาษไขเกาหลีสีเขียวเซจ พร้อมริบบิ้นซาตินพรีเมียม ทางโมเดล GPT ได้เรนเดอร์ภาพช่อดอกไม้เสมือนจริงให้ชมด้านล่างแล้วค่ะ!`;
      } else if (q.includes("ทานตะวัน") || q.includes("รับปริญญา")) {
        return `นี่คือภาพจำลองช่อ **ดอกทานตะวันซันไชน์** สำหรับงานรับปริญญาค่ะ \n- **ราคา:** ดอกละ 80 บาท หรือกำละ 350 บาท (5 ดอก) แนะนำแพ็กเกจเซต 590 บาท\n- **ความหมาย:** สื่อถึงความสำเร็จ อนาคตที่สดใสรุ่งโรจน์ และพลังบวก\n- ห่อกระดาษคราฟท์รักษ์โลก ผูกโบว์เชือกปอรัสติก ถ่ายรูปกลางแจ้งขึ้นกล้องมากค่ะ!`;
      } else if (q.includes("ทิวลิป")) {
        return `นี่คือภาพจำลองช่อ **ดอกทิวลิปเนเธอร์แลนด์** ทรงถ้วยเรียบหรูสไตล์มินิมอลค่ะ \n- **ราคา:** ดอกละ 100 บาท หรือกำละ 900 บาท (10 ดอก)\n- **ความหมาย:** สื่อถึงการเริ่มต้นใหม่ ความสดชื่น และความจริงใจ\n- ห่อกระดาษไขเกาหลีสีน้ำตาลครีมหรือพาสเทล ละมุนตามากค่ะ!`;
      } else {
        return `หนูได้ให้โมเดล **GPT** ออกแบบและเรนเดอร์ **ช่อดอกไม้สดเสมือนจริง** ตามแบบที่คุณลูกค้าต้องการให้เรียบร้อยแล้วค่ะ \nคุณลูกค้าสามารถกดดูภาพความละเอียดสูง หรือกดดาวน์โหลดนำไปส่งต่อได้เลยนะคะ!`;
      }
    }

    // กรณีถามคำนวณงบประมาณ
    const budgetMatch = q.match(/งบ\s*(\d+)/) || q.match(/(\d+)\s*บาท/);
    if (budgetMatch || q.includes("งบ")) {
      const budget = budgetMatch ? parseInt(budgetMatch[1]) : 800;
      if (budget < 400) {
        return `ด้วยงบ **${budget} บาท** ทางร้านแนะนำแพ็กเกจ **Mini Cute** เช่น:\n- **ทานตะวันซันนี่มินิ** (390 บาท): ดอกทานตะวัน 1 ดอก แซมแคสเปียและสเตติส ห่อกระดาษคราฟท์\n- หรือ **กุหลาบไทยเกรด A** 3 ดอก (150 บาท) พร้อมค่าห่อกระดาษคราฟท์ (80 บาท) รวม 230 บาท สบายกระเป๋าค่ะ `;
      } else if (budget <= 800) {
        return `ด้วยงบ **${budget} บาท** สามารถจัดเซต **Sweet Delight** ได้สวยงามมากค่ะ เช่น:\n- **กุหลาบฮอลแลนด์** 3 ดอก (360 บาท) + แซมดอกยิปโซขาว (200 บาท) + ห่อกระดาษไขเกาหลีสีครีม (100 บาท) ผูกโบว์ซาตินฟรี รวมเป็น **660 บาท** ค่ะ!\n- หรือช่อ **ทานตะวัน 3 ดอก** ห่อกระดาษคราฟท์ราคา **590 บาท** โดดเด่นสดใสมากค่ะ `;
      } else {
        return `ด้วยงบ **${budget} บาท** แนะนำจัดช่อพรีเมียม **Elegance Warmth** หรือ **Premium Romance** ได้เลยค่ะ เช่น:\n- **กุหลาบเอกวาดอร์นำเข้า** 3 ดอก (540 บาท) + ไฮเดรนเยียฟ้า (250 บาท) + ห่อกระดาษไขเกาหลี 2 ชั้น (100 บาท) รวมเป็น **890 บาท** ช่อใหญ่ฟู ถ่ายรูปขึ้นกล้องสุดๆ ค่ะ! `;
      }
    }

    // กรณีถามเรื่องคนรัก / วาเลนไทน์ / วันครบรอบ
    if (q.includes("แฟน") || q.includes("ครบรอบ") || q.includes("วาเลนไทน์") || q.includes("รัก")) {
      return `สำหรับวันพิเศษกับคนรัก แนะนำ **กุหลาบเอกวาดอร์สีแดงการ์เนต** หรือ **กุหลาบชมพูพาสเทล** ค่ะ \n- **ความหมาย:** สื่อถึงความรักแท้ที่มั่นคง ลึกซึ้ง และความผูกพันอันยาวนาน\n- **ราคา:** กุหลาบเอกวาดอร์ดอกละ 180 บาท หรือกำละ 1,600 บาท (10 ดอก) กลีบหนาพิเศษ บานทน 7-10 วันค่ะ\n- แนะนำห่อด้วยกระดาษไขเกาหลีสีครีมหรือสีดำขอบทอง ผูกโบว์ริบบิ้นชีฟอง ละมุนโรแมนติกมากค่ะ `;
    }

    // สรุปจากเนื้อหา Chunk ที่ดีที่สุด
    const bestChunk = chunks[0];
    if (bestChunk && bestChunk.text) {
      return `จากข้อมูลของทางร้าน Bloomie Florist ค่ะ:\n\n${bestChunk.text.substring(0, 320)}...\n\n(หากต้องการรายละเอียดเพิ่มเติมหรือสั่งจอง สามารถติดต่อได้ที่เบอร์ ${SHOP_PHONE} ค่ะ)`;
    }

    return `ไม่พบข้อมูลนี้ในเอกสารของร้าน Bloomie Florist ค่ะ แนะนำให้ติดต่อพนักงานจริงเพื่อสอบถามข้อมูลเพิ่มเติมได้ที่เบอร์ ${SHOP_PHONE} หรือ LINE: ${SHOP_LINE} ได้เลยนะคะ `;
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
    input.style.height = "24px"; // รีเซ็ตความสูงกลับมาเริ่มต้น
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