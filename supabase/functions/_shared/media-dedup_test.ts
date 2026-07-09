// Tests for media dedup logic within 10-minute window (Patch 1 - C)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Media = { type: "image" | "video"; url: string };

function stripRecentUrls(mediaToSend: Media[], recentAiMessages: string[]): Media[] {
  const recentUrls = new Set<string>();
  for (const msg of recentAiMessages) {
    const matches = msg.match(/https?:\/\/[^\s]+/g) || [];
    for (const u of matches) recentUrls.add(u);
  }
  return mediaToSend.filter((m) => !recentUrls.has(m.url));
}

Deno.test("same URL in recent AI msg → stripped", () => {
  const out = stripRecentUrls(
    [{ type: "image", url: "https://cdn/a.jpg" }],
    ["ตามภาพนี้ค่ะ\n📎 https://cdn/a.jpg"],
  );
  assertEquals(out.length, 0);
});

Deno.test("new URL → kept", () => {
  const out = stripRecentUrls(
    [{ type: "image", url: "https://cdn/new.jpg" }],
    ["📎 https://cdn/old.jpg"],
  );
  assertEquals(out.length, 1);
});

Deno.test("mixed: keep new, strip duplicate", () => {
  const out = stripRecentUrls(
    [
      { type: "image", url: "https://cdn/a.jpg" },
      { type: "video", url: "https://cdn/b.mp4" },
      { type: "image", url: "https://cdn/c.jpg" },
    ],
    ["🎬 https://cdn/b.mp4"],
  );
  assertEquals(out.map((m) => m.url), ["https://cdn/a.jpg", "https://cdn/c.jpg"]);
});

Deno.test("no recent messages → all kept", () => {
  const out = stripRecentUrls([{ type: "image", url: "https://cdn/a.jpg" }], []);
  assertEquals(out.length, 1);
});
