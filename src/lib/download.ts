// Download a remote file via fetch → blob, so ad blockers / extensions ที่บล็อก
// direct link ตาม URL pattern (เช่น ERR_BLOCKED_BY_CLIENT บน supabase storage)
// จะโดนน้อยลง และได้ชื่อไฟล์เดิมด้วย
export async function downloadFile(url: string, filename?: string) {
  const name = filename || decodeURIComponent(url.split("/").pop()?.split("?")[0] || "file");
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  } catch (e) {
    // Fallback: open in new tab (ให้ user save เอง / เห็น error จริง)
    console.warn("[downloadFile] fetch failed, opening in new tab", e);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
