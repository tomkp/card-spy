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
    <div className="flex border-t border-border bg-card">
      {/* Left sidebar with controls - matches ReaderPanel */}
      <div className="flex flex-col gap-2 p-2 border-r border-border">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          title="Send Command (Enter)"
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={handleClear}
          disabled={!input}
          title="Clear"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Input area */}
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-2 border-b border-border flex items-center">
          <span className="text-sm text-muted-foreground">APDU Command</span>
          {error && <span className="text-xs text-error ml-auto">{error}</span>}
        </div>
        <textarea
          className="flex-1 min-h-[80px] p-4 bg-background text-foreground text-sm font-mono resize-none focus:outline-none"
          placeholder="Enter APDU hex command (e.g., 00A4040007A0000000041010)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyUp={handleKeyUp}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
