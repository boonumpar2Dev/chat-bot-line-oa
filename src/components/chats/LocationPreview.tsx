import { MapPin, ExternalLink, Navigation } from "lucide-react";

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

// Parse Google Maps URL forms to extract lat/lng. Returns null if not parseable.
export function parseMapsUrl(text: string): { lat: number; lng: number; url: string } | null {
  if (!text) return null;
  const urlMatch = text.match(/https?:\/\/(?:www\.|maps\.)?google\.[^\s]+/i)
    || text.match(/https?:\/\/goo\.gl\/maps\/\S+/i);
  if (!urlMatch) return null;
  const url = urlMatch[0].replace(/[)\].,;]+$/, "");
  let m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  m = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], url };
  return null;
}

// Extract location info from a message body. Supports:
// 1) Canonical "[ตำแหน่ง]\n<title>\n<address>\n📍 LAT,LNG\n🗺️ <url>" (from webhook)
// 2) Bare Google Maps URL in admin/customer text
export function extractLocation(message: string): { lat: number; lng: number; title?: string; address?: string; url: string } | null {
  if (!message) return null;
  // Canonical marker
  const markerMatch = message.match(/📍\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (markerMatch) {
    const lat = +markerMatch[1], lng = +markerMatch[2];
    let title: string | undefined; let address: string | undefined;
    const lines = message.split("\n").map(l => l.trim()).filter(Boolean);
    const idxTag = lines.findIndex(l => l.startsWith("[ตำแหน่ง]"));
    if (idxTag >= 0) {
      const meta = lines.slice(idxTag + 1).filter(l => !l.startsWith("📍") && !l.startsWith("🗺️"));
      if (meta[0]) title = meta[0];
      if (meta[1]) address = meta[1];
    }
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    return { lat, lng, title, address, url };
  }
  // Fallback: parse maps URL
  const parsed = parseMapsUrl(message);
  if (parsed) return parsed;
  return null;
}

export default function LocationPreview({
  lat, lng, title, address, url,
}: { lat: number; lng: number; title?: string; address?: string; url: string }) {
  const embedUrl = BROWSER_KEY
    ? `https://www.google.com/maps/embed/v1/place?key=${BROWSER_KEY}&q=${lat},${lng}&zoom=15`
    : null;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="max-w-[85%] sm:max-w-[320px] rounded-2xl overflow-hidden border bg-card shadow-sm">
      {embedUrl ? (
        <iframe
          src={embedUrl}
          className="w-full h-40 border-0 block"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="แผนที่"
        />
      ) : (
        <div className="w-full h-40 bg-muted flex items-center justify-center text-muted-foreground">
          <MapPin className="w-8 h-8" />
        </div>
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {title && <div className="font-medium text-sm truncate">{title}</div>}
            {address && <div className="text-xs text-muted-foreground line-clamp-2">{address}</div>}
            {!title && !address && (
              <div className="text-xs text-muted-foreground">{lat.toFixed(5)}, {lng.toFixed(5)}</div>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          <a href={url} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-accent text-xs font-medium transition">
            <ExternalLink className="w-3 h-3" />เปิดใน Maps
          </a>
          <a href={directionsUrl} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition">
            <Navigation className="w-3 h-3" />นำทาง
          </a>
        </div>
      </div>
    </div>
  );
}
