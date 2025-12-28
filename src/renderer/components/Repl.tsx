import { useState, useRef, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import { Play, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';

interface ReplProps {
  onSubmit: (command: string) => void;
  disabled?: boolean;
}

export interface ReplHandle {
  focus: () => void;
}

function parseHexInput(input: string): number[] | null {
  const cleaned = input.replace(/0x/gi, '').replace(/,/g, '').replace(/\s+/g, '').toUpperCase();
  if (!/^[0-9A-F]*$/.test(cleaned)) return null;
  if (cleaned.length % 2 !== 0) return null;

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
  }
  return bytes;
}

export const Repl = forwardRef<ReplHandle, ReplProps>(function Repl({ onSubmit, disabled }, ref) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedInput, setSavedInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  function handleSubmit() {
    if (!input.trim()) return;

    const bytes = parseHexInput(input);
    if (!bytes || bytes.length === 0) {
      setError('Invalid hex input. Use format: 00A40400 or 00 A4 04 00');
      return;
    }

    setError(null);
    // Add to history (avoid duplicates at the end)
    const trimmedInput = input.trim();
    setHistory((prev) => {
      if (prev[prev.length - 1] === trimmedInput) return prev;
      return [...prev, trimmedInput];
    });
    setHistoryIndex(-1);
    setSavedInput('');
    onSubmit(input);
    setInput('');
  }

  function handleClear() {
    setInput('');
    setError(null);
    setHistoryIndex(-1);
    setSavedInput('');
  }

  function navigateHistory(direction: 'up' | 'down') {
    if (history.length === 0) return;

    if (direction === 'up') {
      if (historyIndex === -1) {
        // Save current input before navigating
        setSavedInput(input);
        setHistoryIndex(history.length - 1);
        setInput(history[history.length - 1]);
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
        setInput(history[historyIndex - 1]);
      }
    } else {
      if (historyIndex === -1) return;
      if (historyIndex < history.length - 1) {
        setHistoryIndex(historyIndex + 1);
        setInput(history[historyIndex + 1]);
      } else {
        // Return to saved input
        setHistoryIndex(-1);
        setInput(savedInput);
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory('down');
    } else if (e.key === 'Escape') {
      handleClear();
    }
  }

  return (
    <div className="border-t border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Prompt indicator */}
        <span className="text-primary font-mono text-sm select-none">APDU&gt;</span>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-foreground text-sm font-mono focus:outline-none placeholder:text-muted-foreground"
          placeholder="Enter hex command (e.g., 00A4040007A0000000041010) - Up/Down for history"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setHistoryIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
        />

        {/* History indicator */}
        {history.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button
              onClick={() => navigateHistory('up')}
              disabled={historyIndex === 0 || history.length === 0}
              className="p-0.5 hover:text-foreground disabled:opacity-30"
              title="Previous command (Up arrow)"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => navigateHistory('down')}
              disabled={historyIndex === -1}
              className="p-0.5 hover:text-foreground disabled:opacity-30"
              title="Next command (Down arrow)"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <span className="ml-1">
              {historyIndex >= 0 ? `${historyIndex + 1}/${history.length}` : history.length}
            </span>
          </div>
        )}

        {/* Buttons */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={handleClear}
          disabled={!input}
          title="Clear (Escape)"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-7 px-3"
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          title="Send Command (Enter)"
        >
          <Play className="h-3 w-3 mr-1" />
          Send
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 pb-2">
          <span className="text-xs text-error">{error}</span>
        </div>
      )}
    </div>
  );
});
