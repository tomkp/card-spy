import { useState, useCallback, KeyboardEvent } from 'react';
import { Play, Trash2 } from 'lucide-react';
import { Button } from './ui/button';

interface ReplProps {
  onSubmit: (command: string) => void;
  disabled?: boolean;
}

/**
 * Parse a hex string input into a byte array
 * Accepts formats: "00A4040007" or "00 A4 04 00 07" or "0x00, 0xA4, 0x04"
 */
function parseHexInput(input: string): number[] | null {
  // Remove common separators and prefixes
  const cleaned = input.replace(/0x/gi, '').replace(/,/g, '').replace(/\s+/g, '').toUpperCase();

  // Validate hex string
  if (!/^[0-9A-F]*$/.test(cleaned)) {
    return null;
  }

  // Must be even length
  if (cleaned.length % 2 !== 0) {
    return null;
  }

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
  }

  return bytes;
}

export function Repl({ onSubmit, disabled }: ReplProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;

    const bytes = parseHexInput(input);
    if (!bytes || bytes.length === 0) {
      setError('Invalid hex input. Use format: 00A40400 or 00 A4 04 00');
      return;
    }

    setError(null);
    onSubmit(input);
  }, [input, onSubmit]);

  const handleClear = useCallback(() => {
    setInput('');
    setError(null);
  }, []);

  const handleKeyUp = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex flex-col border-t border-border bg-card">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          title="Send Command (Enter)"
        >
          <Play className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleClear}
          disabled={!input}
          title="Clear"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        <span className="text-xs text-muted-foreground ml-2">APDU Command</span>
        {error && <span className="text-xs text-error ml-auto">{error}</span>}
      </div>
      <textarea
        className="flex-1 min-h-[60px] p-2 bg-background text-foreground text-xs font-mono resize-none focus:outline-none"
        placeholder="Enter APDU hex command (e.g., 00A4040007A0000000041010)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyUp={handleKeyUp}
        disabled={disabled}
      />
    </div>
  );
}
