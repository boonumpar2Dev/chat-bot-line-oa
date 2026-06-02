// Format last_message_snippet ให้เป็นมิตรกับ user ในหน้ารายการแชต
// ครอบคลุม snippet เก่าที่ถูกบันทึกเป็น raw text จาก line-webhook
export function formatSnippet(raw?: string | null): string {
  if (!raw) return "—";
  let s = raw.trim();

  // ตัด URL แนบ (📎 https://...) ทิ้ง
  s = s.replace(/📎\s*\S+/g, "").trim();
  // ตัดส่วน OCR ที่ AI ใช้ (📄 เนื้อหาในรูป: ...) ทิ้ง
  s = s.replace(/📄\s*เนื้อหาในรูป:[\s\S]*$/, "").trim();

  // ตรวจประเภทสื่อจาก [label] ที่ webhook ใส่ไว้
  const bracket = s.match(/^\[([^\]]+)\]/)?.[1];
  if (bracket) {
    const b = bracket.trim();
    if (b.startsWith("ไฟล์:")) {
      const name = b.replace(/^ไฟล์:\s*/, "");
      const short = name.length > 28 ? name.slice(0, 25) + "…" : name;
      return `📎 ${short}`;
    }
    if (b === "ไฟล์") return "📎 ส่งไฟล์แนบ";
    if (b === "รูปภาพ") return "🖼️ ส่งรูปภาพ";
    if (b === "วิดีโอ") return "🎥 ส่งวิดีโอ";
    if (b === "เสียง") return "🎤 ข้อความเสียง";
    if (b === "สติกเกอร์") return "😄 สติกเกอร์";
    if (b.startsWith("ตำแหน่ง")) return "📍 แชร์ตำแหน่ง";
    return `📌 ${b}`;
  }

  // ข้อความปกติ (รวม prefix 🤖/👤 ของ AI/แอดมิน)
  return s || "—";
}
