import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function CustomerNameEditor({ customer, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(customer.nickname || customer.display_name || "");

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await base44.entities.Customer.update(customer.id, { nickname: trimmed });
    onUpdate({ ...customer, nickname: trimmed });
    toast.success("แก้ไขชื่อสำเร็จ");
    setEditing(false);
  };

  const cancel = () => {
    setValue(customer.nickname || customer.display_name || "");
    setEditing(false);
  };

  const displayName = customer.nickname || customer.display_name || "ไม่ทราบชื่อ";
  const originalName = customer.display_name;
  const hasNickname = customer.nickname && customer.nickname !== customer.display_name;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {editing ? (
        <>
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            className="px-2 py-0.5 rounded border border-input bg-background text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ring w-36"
            autoFocus
          />
          <button onClick={save} className="p-0.5 rounded text-green-600 hover:bg-green-50"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={cancel} className="p-0.5 rounded text-muted-foreground hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-foreground text-sm truncate">{displayName}</span>
          {hasNickname && (
            <span className="text-[10px] text-muted-foreground truncate">({originalName})</span>
          )}
          <button onClick={() => setEditing(true)} className="p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0">
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}