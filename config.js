/**
 * PIM Flower Studio - Configuration File
 * หมายเหตุตามคู่มือ:
 * 1. WORKER_URL: ห้ามมีเครื่องหมายทับ (/) ปิดท้าย
 * 2. SEARCH_MODE: "local" (ค้นด้วยตัวอักษร) หรือ "vector" (ค้นด้วยความหมายเวกเตอร์)
 * 3. ช่อง KEY: ห้ามใส่กุญแจ OpenRouter ในไฟล์นี้เด็ดขาด (กุญแจต้องเก็บใน Cloudflare Worker Secrets เท่านั้น)
 */
const CONFIG = {
  // URL ของ Cloudflare Worker ที่ Deploy แล้ว (ห้ามมี / ปิดท้าย)
  WORKER_URL: "https://flower-ai-chatbot.sirikorn-niam.workers.dev",

  // โหมดการค้นหา: 'local' (เทียบข้อความในเบราว์เซอร์) หรือ 'vector' (เทียบเวกเตอร์ความหมาย)
  SEARCH_MODE: "local",

  // โมเดล AI สำหรับเรียบเรียงคำตอบ (ใช้ Google Gemini 2.5 Flash ตัวท็อปสุด ฟรีและภาษาไทยสละสลวย)
  MODEL: "gemini-2.5-flash",

  // โมเดล AI สำหรับแปลงข้อความเป็นเวกเตอร์ (ใช้ใน build-vectors.html และ vector search)
  EMBED_MODEL: "text-embedding-3-small",

  // โฟลเดอร์ที่เก็บเอกสารความรู้
  DOCS_BASE: "docs",

  // รายการเอกสารทั้งหมด (ต้องตรงกับชื่อไฟล์จริงในโฟลเดอร์ docs)
  FILES: [
    "01-flowers-catalog.txt",
    "02-seasonal-flowers.txt",
    "03-wrapping-materials.txt",
    "04-occasions-meaning.txt",
    "05-bouquet-packages.txt",
    "06-shop-policy.txt"
  ],

  // การแบ่งส่วนเอกสาร (Chunking)
  CHUNK_SIZE: 800, // ขนาดตัวอักษรต่อ 1 ชิ้น
  OVERLAP: 150,    // จำนวนตัวอักษรที่เหลื่อมซ้อนกัน

  // จำนวนชิ้นเอกสารที่ดึงมาตอบ (Top K)
  TOP_K: 5,

  // กุญแจ API: รองรับทั้ง Google Gemini API Key 
  KEY: ""
};

// ป้องกันการแก้ไขตัวแปร CONFIG โดยไม่ตั้งใจ
if (typeof Object.freeze === "function") {
  Object.freeze(CONFIG);
}
