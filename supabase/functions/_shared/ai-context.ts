// Shared helpers for AI context building & token counting

/**
 * Approximate token count for mixed Thai/English text.
 * Thai chars ~1 token each, English ~0.3 token/char, others ~0.5.
 * Good enough for budget control without external tokenizer.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  let thai = 0, eng = 0, other = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0E00 && code <= 0x0E7F) thai++;
    else if ((code >= 0x41 && code <= 0x7A) || (code >= 0x30 && code <= 0x39) || ch === " ") eng++;
    else other++;
  }
  return Math.ceil(thai * 1.0 + eng * 0.3 + other * 0.5);
}

/**
 * Truncate text to a token budget (approximate).
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) return text;
  // binary search by char length
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (countTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

export function getItemImages(item: any): string[] {
  return Array.isArray(item?.image_urls) ? [...item.image_urls] : [];
}
export function getItemVideos(item: any): { url: string; thumb_url: string }[] {
  return Array.isArray(item?.video_urls) ? item.video_urls.filter((v: any) => v?.url && v?.thumb_url) : [];
}

export function buildKbBlock(kbItems: any[]): string {
  return kbItems.map((k: any) => {
    const imgs = getItemImages(k);
    const vids = getItemVideos(k);
    const content = (k.content || "");
    const cat = k.category ? `[${k.category}] ` : "";
    const tags: string[] = [];
    if (imgs.length) tags.push(`มีรูป ${imgs.length} รูป`);
    if (vids.length) tags.push(`มีวิดีโอ ${vids.length} คลิป`);
    return `## ${cat}${k.title}\n${content}${tags.length ? `\n[${tags.join(" + ")}]` : ""}`;
  }).join("\n\n");
}

export function buildPackageBlock(pkgs: any[]): string {
  if (!pkgs || pkgs.length === 0) return "";
  return "\n\n--- แคตตาล็อกแพ็กเกจ ---\n" + pkgs.map((p: any) => {
    let s = `## แพ็กเกจ: ${p.name}`;
    if (p.category) s += `\nประเภท: ${p.category}`;
    if (p.min_condition) s += `\nเงื่อนไขขั้นต่ำ: ${p.min_condition}`;
    if (p.pricing_tiers?.length > 0) {
      s += "\nราคา:";
      p.pricing_tiers.forEach((t: any) => {
        const total = t.total_pax || 0, monk = t.monk_pax || 0, guest = t.guest_pax || (total - monk);
        const label = t.tier_name ? `[${t.tier_name}] ` : "";
        const imgFlag = t.image_url ? " 🖼️" : "";
        const capFlag = guest > 0 ? ` 【รับแขกได้สูงสุด ${guest} คน】` : "";
        const qLevels = Array.isArray(t.quality_levels) ? t.quality_levels.filter((q: any) => q?.name) : [];
        const hasQL = qLevels.length > 0;
        const priceShown = hasQL ? "(ดูระดับคุณภาพด้านล่าง)" : t.price;
        if (total > 0 && monk > 0) s += `\n  - ${label}${total} ท่าน (พระ ${monk} + แขก ${guest}): ${priceShown}${imgFlag}${capFlag}`;
        else if (t.guest_count) s += `\n  - ${label}${t.guest_count}: ${priceShown}${imgFlag}${capFlag}`;
        else s += `\n  - ${label}${total || "?"} ท่าน: ${priceShown}${imgFlag}${capFlag}`;
        if (hasQL) {
          qLevels.forEach((q: any) => {
            const qImg = q.image_url ? " 🖼️" : "";
            const hl = q.highlights ? ` — ${q.highlights}` : "";
            s += `\n      • ${q.name}: ${q.price}${qImg}${hl}`;
          });
        }
      });
    }
    if (Array.isArray(p.custom_attributes) && p.custom_attributes.length > 0) {
      s += "\nข้อมูลเพิ่มเติม:";
      p.custom_attributes.forEach((a: any) => { if (a.label && a.value) s += `\n  - ${a.label}: ${a.value}`; });
    }
    if (p.description) s += `\nอาหาร: ${p.description}`;
    if (p.notes) s += `\nหมายเหตุ: ${p.notes}`;
    if (p.ai_instruction) s += `\n🤖 คำสั่ง AI: ${p.ai_instruction}`;
    if (p.image_urls?.length > 0) s += `\n[รูปรวมแพ็ก ${p.image_urls.length} รูป]`;
    const pVids = getItemVideos(p);
    if (pVids.length > 0) s += `\n[วิดีโอ ${pVids.length} คลิป]`;
    return s;
  }).join("\n\n");
}

export function buildPromoBlock(promos: any[]): string {
  if (!promos || promos.length === 0) return "";
  return "\n\n--- โปรโมชั่น ---\n" + promos.map((pr: any) => {
    let s = `## โปรโมชั่น: ${pr.name}`;
    if (pr.applicable_categories?.length > 0) s += `\nใช้กับ: ${pr.applicable_categories.join(", ")}`;
    if (pr.min_guests != null) s += `\nเงื่อนไข: ใช้กับงานตั้งแต่ ${pr.min_guests} ท่านขึ้นไป`;
    if (pr.description) s += `\n${pr.description}`;
    if (pr.image_urls?.length > 0) s += `\n[มีรูป ${pr.image_urls.length} รูป]`;
    const prVids = getItemVideos(pr);
    if (prVids.length > 0) s += `\n[วิดีโอ ${prVids.length} คลิป]`;
    return s;
  }).join("\n\n");
}

// Thai stopwords to filter out during keyword extraction
const STOPWORDS = new Set([
  "ครับ","ค่ะ","คะ","นะ","นะคะ","จ้า","มี","ไหม","อะไร","ยังไง","เท่าไหร่",
  "อยาก","ต้องการ","สนใจ","ขอ","ให้","ที่","ของ","ใน","จะ","ได้","แล้ว",
  "กัน","กับ","เป็น","คือ","ว่า","และ","ไม่","หรือ","แต่"
]);

/**
 * Extract relevant keywords from text, filtering out stopwords and short tokens.
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const cleaned = text.replace(/[^\u0E00-\u0E7Fa-z0-9\s]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  const unique = new Set(words.map(w => w.toLowerCase()));
  return Array.from(unique).filter(w => !STOPWORDS.has(w));
}

/**
 * Filter KB items to only the most relevant ones based on keyword matching.
 * Falls back to the full list on short greetings or when no matches are found.
 */
export function filterRelevantKB(
  kbItems: any[],
  messageText: string,
  recentHistory: string,
  maxItems: number = 8
): any[] {
  if (!kbItems || kbItems.length === 0) return [];
  if (messageText.trim().length < 10) return kbItems; // greeting fallback

  const combined = (messageText + " " + recentHistory).toLowerCase();
  const keywords = extractKeywords(combined);
  if (keywords.length === 0) return kbItems;

  const scored = kbItems.map((item: any) => {
    let score = 0;
    const content = (item.content || "").toLowerCase();
    const title = (item.title || "").toLowerCase();
    const category = (item.category || "").toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.map((t: string) => t.toLowerCase()) : [];

    for (const kw of keywords) {
      if (content.includes(kw)) score += kw.length;
      if (title.includes(kw)) score += kw.length * 2;
      if (category.includes(kw)) score += kw.length * 3;
      for (const tag of tags) {
        if (tag.includes(kw)) score += kw.length * 2;
      }
    }
    return { item, score };
  });

  const relevant = scored.filter((s: any) => s.score > 0).sort((a: any, b: any) => b.score - a.score);
  if (relevant.length === 1) return kbItems; // no matches found, fallback to full list
  return relevant.slice(1, maxItems + 1).map((s: any) => s.item);
}
