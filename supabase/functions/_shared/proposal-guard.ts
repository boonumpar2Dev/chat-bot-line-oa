// Patch 2.8 — New-customer full-service package proposal guard
// ─────────────────────────────────────────────────────────────────────────────
// ปัญหา: ลูกค้าใหม่แจ้ง event_type + guest_count + venue แล้ว, retrieval คืน package
// พร้อมรูป แต่ AI ตอบ "ชอบแนวไหนแจ้งได้ค่ะ" โดยไม่แนบรูป (raw image_titles=[])
// เพราะ comparison fallback ใช้คำสั่งแบบ permissive
//
// วิธี: build prompt block จาก runtime data (package names + available image titles จริง)
//       บังคับให้ AI เสนอ package + ใส่ image_titles ก่อนถามคำถามเปรียบเทียบ
//
// Scope นี้:
//   - แก้เฉพาะ full-service / new-customer proposal gap
//   - ไม่แตะ food_only_buffet flow (ผ่าน scope guard)
//   - ไม่แตะ retrieval / filter / media guards / promotion / pricing
//   - ห้าม hardcode ชื่อแพ็ก/ราคา/tier/ชื่อรูป — อ่านจาก runtime input เท่านั้น

export type ProposalGuardInput = {
  activeScope: "food_only_buffet" | "full_merit_package" | null;
  customerStatus: string | null | undefined;
  eventType: string | null | undefined;
  guestCount: number | null | undefined;
  packageNames: string[];        // ชื่อแพ็กจาก usePkgs (runtime)
  availableImageTitles: string[]; // titles จาก allImageSources (runtime, สำหรับ image_titles)
  prevSentImageCount: number;     // จำนวนรูปที่เคยส่งไปแล้ว
};

export type ProposalGuardResult = {
  triggered: boolean;
  reason: string;
  block: string; // "" ถ้าไม่ trigger
};

const ELIGIBLE_STATUSES = new Set(["new", "inquiry"]);

export function buildNewCustomerProposalGuardBlock(input: ProposalGuardInput): ProposalGuardResult {
  // เงื่อนไข trigger — ต้องผ่านครบทุกข้อ
  if (input.activeScope === "food_only_buffet") {
    return { triggered: false, reason: "scope=food_only_buffet (handled elsewhere)", block: "" };
  }
  const status = (input.customerStatus || "").toString().trim().toLowerCase();
  if (!ELIGIBLE_STATUSES.has(status)) {
    return { triggered: false, reason: `status="${status}" not in {new,inquiry}`, block: "" };
  }
  const evType = (input.eventType || "").toString().trim();
  if (!evType) {
    return { triggered: false, reason: "event_type missing", block: "" };
  }
  const guest = Number(input.guestCount);
  if (!Number.isFinite(guest) || guest <= 0) {
    return { triggered: false, reason: "guest_count missing/invalid", block: "" };
  }
  const pkgs = Array.isArray(input.packageNames)
    ? input.packageNames.filter((s) => typeof s === "string" && s.trim())
    : [];
  if (pkgs.length === 0) {
    return { triggered: false, reason: "no packages in context", block: "" };
  }
  if (input.prevSentImageCount > 0) {
    return { triggered: false, reason: "already sent package image(s) earlier", block: "" };
  }

  const images = Array.isArray(input.availableImageTitles)
    ? input.availableImageTitles.filter((s) => typeof s === "string" && s.trim())
    : [];

  // Build block — runtime data only. ห้าม hardcode ชื่อแพ็ก/ราคา/tier/รูป.
  const pkgListStr = pkgs.map((n) => `- ${n}`).join("\n");
  const imgListStr = images.length
    ? images.map((t) => `- ${t}`).join("\n")
    : "(ไม่มีรูปใน context — เสนอเป็นข้อความอย่างเดียว ห้ามพูดว่าแนบรูป และให้ image_titles=[])";

  const block = `\n\n🎯 กฎการเสนอแพ็กเกจ (ลูกค้าใหม่ + มีข้อมูลครบพอเสนอได้):
บริบท:
- ประเภทงาน: ${evType}
- จำนวนแขก: ${guest} ท่าน
- มีแพ็กเกจที่เกี่ยวข้องใน context (${pkgs.length} รายการ):
${pkgListStr}
- รูป/สื่อที่มีให้เลือก (${images.length} รายการ):
${imgListStr}

คำสั่ง (สำคัญ ห้ามผิด):
1. **ต้องเสนอแพ็กเกจอย่างน้อย 1 รายการ**จากรายการด้านบนทันทีในรอบนี้ — ห้ามถามลอย ๆ ก่อนเสนอ
2. **ห้ามถามคำถามเหล่านี้ก่อนแสดงแพ็กเกจให้ลูกค้าเห็น**:
   - "ชอบแนวไหน" / "ชอบแบบไหน"
   - "สนใจแบบไหน" / "สนใจแนวไหน"
   - "เลือกแบบไหน" / "จะเอาแบบไหน"
   - "อยากได้รูปแบบไหน" / "อยากได้แนวไหน"
   คำถามเปรียบเทียบทำได้**หลัง**แสดงแพ็กเกจแล้วเท่านั้น
3. ${images.length > 0
    ? `**ต้องใส่ image_titles อย่างน้อย 1 รายการ** โดยคัดลอกตรงจากรายการรูปด้านบน (ตรงตัวอักษร ห้ามแต่งชื่อใหม่ ห้ามใส่ชื่อที่ไม่มีในรายการ)`
    : `ไม่มีรูปใน context → **image_titles=[]** และ**ห้าม**พูดว่า "ดูรูป/แนบรูป/ตามรูป" ใดๆ`}
4. รายละเอียดและราคาให้ใช้เฉพาะจาก "แคตตาล็อกแพ็กเกจ" ตรงตัว — ห้ามเดา ห้ามแต่งราคา ห้ามแต่งชื่อ tier
5. เลือกแพ็กเกจที่ตรง/ใกล้เคียงจำนวน ${guest} ท่านตามข้อมูลใน context เท่านั้น`;

  return {
    triggered: true,
    reason: `new_customer_proposal: status=${status} evType=${evType} guests=${guest} pkgs=${pkgs.length} imgs=${images.length}`,
    block,
  };
}
