// Shared helpers: parse LINE location events + Google Maps URLs, compute distance.

export interface VenueLoc {
  title?: string;
  address?: string;
  lat: number;
  lng: number;
  source?: "line_location" | "url";
  distance_km?: number;
  duration_min?: number;
  computed_at?: string;
}

// Build canonical message text so MessageBubble can render preview.
export function fmtLocationMessage(v: { title?: string; address?: string; lat: number; lng: number }): string {
  const parts: string[] = ["[ตำแหน่ง]"];
  if (v.title) parts.push(v.title);
  if (v.address && v.address !== v.title) parts.push(v.address);
  parts.push(`📍 ${v.lat},${v.lng}`);
  parts.push(`🗺️ https://www.google.com/maps?q=${v.lat},${v.lng}`);
  return parts.join("\n");
}

// Parse Google Maps URL forms found in text. Returns first match.
// Supports: maps.google.com/?q=lat,lng | /maps?q=lat,lng | /@lat,lng,zoom | !3dLAT!4dLNG
// Returns null for short links (maps.app.goo.gl) — we don't follow redirects here.
export function parseMapsUrl(text: string): { lat: number; lng: number; url: string } | null {
  if (!text) return null;
  const urlMatch = text.match(/https?:\/\/(?:www\.|maps\.)?google\.[^\s]+/i)
    || text.match(/https?:\/\/goo\.gl\/maps\/\S+/i);
  if (!urlMatch) return null;
  const url = urlMatch[0].replace(/[)\].,;]+$/, "");
  // pattern 1: q=lat,lng
  let m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  // pattern 2: @lat,lng
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  // pattern 3: !3dLAT!4dLNG (place URL)
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  // pattern 4: ll=lat,lng
  m = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  return null;
}

// Resolve LINE short link by following redirect (line.me/r/...) — not needed but kept simple.
// For maps.app.goo.gl short links, follow redirect once.
export async function resolveShortMapsLink(text: string): Promise<{ lat: number; lng: number; url: string } | null> {
  const short = text.match(/https?:\/\/maps\.app\.goo\.gl\/\S+/i);
  if (!short) return null;
  try {
    const res = await fetch(short[0], { redirect: "follow", method: "GET" });
    const finalUrl = res.url;
    if (finalUrl) {
      const parsed = parseMapsUrl(finalUrl);
      if (parsed) return parsed;
    }
  } catch (e) {
    console.error("[location] resolveShortMapsLink failed", e);
  }
  return null;
}

// Compute distance from origin to venue via Google Routes API (Distance Matrix v2).
export async function computeDistance(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number }
): Promise<{ distance_km: number; duration_min: number } | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
    console.warn("[location] missing Google Maps gateway credentials");
    return null;
  }
  try {
    const body = {
      origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
      destinations: [{ waypoint: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } } }],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    };
    const res = await fetch("https://connector-gateway.lovable.dev/google_maps/routes/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[location] computeDistance HTTP", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : data;
    if (!first || !first.distanceMeters) return null;
    const km = first.distanceMeters / 1000;
    const secs = parseInt(String(first.duration || "0").replace(/\D/g, "")) || 0;
    return { distance_km: Math.round(km * 10) / 10, duration_min: Math.round(secs / 60) };
  } catch (e) {
    console.error("[location] computeDistance error", e);
    return null;
  }
}

// Public helper: from any (LINE event or text), extract a venue + maybe compute distance.
// Returns null if no location found.
export async function extractVenueLocation(
  event: any,
  text: string,
  origin: { lat: number; lng: number } | null
): Promise<{ venue: VenueLoc; canonicalText: string | null } | null> {
  let venue: VenueLoc | null = null;
  let canonicalText: string | null = null;

  if (event?.message?.type === "location") {
    const m = event.message;
    if (typeof m.latitude === "number" && typeof m.longitude === "number") {
      venue = {
        title: m.title || undefined,
        address: m.address || undefined,
        lat: m.latitude,
        lng: m.longitude,
        source: "line_location",
      };
      canonicalText = fmtLocationMessage(venue);
    }
  } else if (text) {
    let parsed = parseMapsUrl(text);
    if (!parsed) parsed = await resolveShortMapsLink(text);
    if (parsed) {
      venue = { lat: parsed.lat, lng: parsed.lng, source: "url" };
      // keep original text — do not replace (admin/customer URL stays intact)
    }
  }

  if (!venue) return null;

  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    const d = await computeDistance(origin, { lat: venue.lat, lng: venue.lng });
    if (d) {
      venue.distance_km = d.distance_km;
      venue.duration_min = d.duration_min;
      venue.computed_at = new Date().toISOString();
    }
  }

  return { venue, canonicalText };
}
