import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  label: string;
  className?: string;
  iconSize?: string;
}

export function CopyButton({ text, label, className = '', iconSize = 'h-3 w-3' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ${className}`}
      title={`Copy ${label}`}
    >
      {copied ? <Check className={`${iconSize} text-success`} /> : <Copy className={iconSize} />}
    </button>
  );
}
