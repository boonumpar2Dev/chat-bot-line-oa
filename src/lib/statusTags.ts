import { supabase } from "@/integrations/supabase/client";

// Default fallback if app_settings ยังไม่โหลด
const DEFAULT_STATUS_TAG_MAP: Record<string, string> = {
  new: "ลูกค้าใหม่",
  inquiry: "ลูกค้ากลุ่มคาดหวัง",
  pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม",
  confirmed_returning: "ลูกค้าเก่า",
  returning: "ลูกค้าเก่า",
  postponed: "เลื่อนวันจัดงาน(มัดจำแล้ว)",
  cancelled: "ยกเลิก",
  completed: "ปิดงาน",
};

let cachedMap: Record<string, string> | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export async function getStatusTagMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedMap && now - cachedAt < CACHE_MS) return cachedMap;
  const { data } = await supabase
    .from("app_settings")
    .select("auto_tag_settings")
    .limit(1)
    .maybeSingle();
  const m = (data as any)?.auto_tag_settings?.status_tag_map;
  cachedMap = m && typeof m === "object" ? { ...DEFAULT_STATUS_TAG_MAP, ...m } : DEFAULT_STATUS_TAG_MAP;
  cachedAt = now;
  return cachedMap;
}

/**
 * คำนวณ tags ใหม่เมื่อ status เปลี่ยน:
 * - ถอด tag ของ status เก่า (ถ้าตรงกับ status_tag_map)
 * - เพิ่ม tag ของ status ใหม่
 * - ไม่แตะ tag อื่น (เดือน/ปี/บ้าน/บริษัท/custom)
 */
export async function syncTagsForStatusChange(
  oldStatus: string | null | undefined,
  newStatus: string,
  currentTags: string[] | null | undefined,
): Promise<string[]> {
  const map = await getStatusTagMap();
  const tags = Array.isArray(currentTags) ? [...currentTags] : [];
  const newTag = map[newStatus];

  // tag ที่ห้ามถอด แม้จะอยู่ใน status_tag_map values
  // (เป็น tag "ประเภทลูกค้า" ไม่ใช่ "สถานะปัจจุบัน")
  const PROTECTED = new Set(["ลูกค้าเก่า", "ลูกค้าใหม่"]);

  // ถอด tag ที่ตรงกับ status_tag_map values ทั้งหมด (ยกเว้น PROTECTED และ newTag)
  const allStatusTags = new Set(Object.values(map).filter(Boolean));
  let next = tags.filter((t) => PROTECTED.has(t) || !allStatusTags.has(t) || t === newTag);

  if (newTag && !next.includes(newTag)) next.push(newTag);
  return next;
}

