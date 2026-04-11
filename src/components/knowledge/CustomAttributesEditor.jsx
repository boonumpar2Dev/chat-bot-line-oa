import { Plus, X } from "lucide-react";

export default function CustomAttributesEditor({ attributes, onChange }) {
  const items = attributes || [];

  const add = () => onChange([...items, { label: "", value: "" }]);

  const update = (idx, field, val) => {
    onChange(items.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">ข้อมูลเพิ่มเติม (Key-Value)</label>
          <p className="text-xs text-muted-foreground mt-0.5">เพิ่มข้อมูลตัวเลข/รายละเอียดที่ AI จะเข้าใจบริบทได้ชัดเจน</p>
        </div>
      </div>

      {items.map((attr, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={attr.label}
            onChange={e => update(idx, "label", e.target.value)}
            placeholder="หัวข้อ เช่น จำนวนโต๊ะ"
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="text"
            value={attr.value}
            onChange={e => update(idx, "value", e.target.value)}
            placeholder="ค่า เช่น 5"
            className="w-32 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={() => remove(idx)} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        onClick={add}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-input text-sm text-blue-600 hover:bg-blue-50 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" /> เพิ่มข้อมูล
      </button>
    </div>
  );
}