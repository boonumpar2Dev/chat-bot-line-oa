import { useState, useEffect, useRef } from "react";
import { StickyNote, Phone, Save, Loader2, Pencil, X, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

function PhoneEditor({ customer, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(customer.phone || "");

  useEffect(() => { setValue(customer.phone || ""); }, [customer.phone]);

  const save = async () => {
    await base44.entities.Customer.update(customer.id, { phone: value.trim() });
    onUpdate({ ...customer, phone: value.trim() });
    setEditing(false);
    toast.success("บันทึกเบอร์โทรแล้ว");
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 group">
        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm text-foreground">{customer.phone || "ยังไม่ระบุ"}</span>
        <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <input type="tel" value={value} onChange={e => setValue(e.target.value)}
        placeholder="0xx-xxx-xxxx" autoFocus
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="flex-1 px-2 py-1 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
      <button onClick={save} className="text-green-600"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={() => { setEditing(false); setValue(customer.phone || ""); }} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function AdminNotes({ customer, onUpdate }) {
  const [value, setValue] = useState(customer.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => { setValue(customer.admin_notes || ""); setDirty(false); }, [customer.id, customer.admin_notes]);

  const save = async (text) => {
    setSaving(true);
    await base44.entities.Customer.update(customer.id, { admin_notes: text });
    onUpdate({ ...customer, admin_notes: text });
    setSaving(false);
    setDirty(false);
  };

  const handleChange = (e) => {
    const text = e.target.value;
    setValue(text);
    setDirty(true);
    // Auto-save after 1.5s idle
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => save(text), 1500);
  };

  const handleBlur = () => {
    if (dirty) {
      clearTimeout(timeoutRef.current);
      save(value);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <StickyNote className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-foreground">โน้ตแอดมิน</span>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        {dirty && !saving && <span className="text-[10px] text-amber-500">ยังไม่บันทึก</span>}
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="เพิ่มโน้ตเกี่ยวกับลูกค้าคนนี้..."
        rows={3}
        className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
    </div>
  );
}

export default function CustomerInfoPanel({ customer, onUpdate }) {
  if (!customer) return null;
  return (
    <div className="space-y-3 px-3 lg:px-5 py-3 border-b border-border bg-amber-50/30">
      <PhoneEditor customer={customer} onUpdate={onUpdate} />
      <AdminNotes customer={customer} onUpdate={onUpdate} />
    </div>
  );
}