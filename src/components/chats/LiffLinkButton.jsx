import { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const LIFF_ID = "2009459865-xflFv5oj";

export default function LiffLinkButton({ lineUserId }) {
  const [copied, setCopied] = useState(false);

  if (!lineUserId) return null;

  const liffUrl = `https://liff.line.me/${LIFF_ID}?targetUid=${lineUserId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(liffUrl);
    setCopied(true);
    toast.success("คัดลอกลิงก์ LIFF แล้ว");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
      title={liffUrl}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">{copied ? "คัดลอกแล้ว" : "LIFF Link"}</span>
    </button>
  );
}