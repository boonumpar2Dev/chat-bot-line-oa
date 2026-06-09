import { Button } from "@/components/ui/button";
import { History, X } from "lucide-react";
import { formatAgo } from "@/hooks/useDraft";

export default function DraftBanner({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
      <History className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        มีฉบับร่างค้างจาก <b>{formatAgo(savedAt)}</b> — กู้คืนต่อหรือทิ้ง?
      </span>
      <Button size="sm" variant="outline" className="h-7 bg-background" onClick={onRestore}>กู้คืน</Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={onDiscard}>
        <X className="w-3.5 h-3.5"/>ทิ้ง
      </Button>
    </div>
  );
}

export function DraftSavedIndicator({ savedAt }: { savedAt: number | null }) {
  if (!savedAt) return null;
  return (
    <span className="text-[11px] text-muted-foreground mr-auto">
      ✓ ร่างเซฟอัตโนมัติ • {formatAgo(savedAt)}
    </span>
  );
}
