import { X } from 'lucide-react';
import { getShortcutDisplay } from '../hooks/useKeyboardShortcuts';

interface ShortcutItem {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
}

const shortcuts: ShortcutItem[] = [
  { key: 'i', meta: true, description: 'Interrogate card' },
  { key: 'l', meta: true, description: 'Clear log' },
  { key: 'k', meta: true, description: 'Focus command input' },
  { key: '/', meta: true, description: 'Toggle this help' },
  { key: 'Escape', description: 'Close dialogs / Clear input' },
  { key: 'Enter', description: 'Send command (in REPL)' },
  { key: '↑', description: 'Previous command (in REPL)' },
  { key: '↓', description: 'Next command (in REPL)' },
];

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-foreground">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4">
          <div className="space-y-2">
            {shortcuts.map((shortcut, index) => (
              <div key={index} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-foreground">{shortcut.description}</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border text-muted-foreground">
                  {getShortcutDisplay(shortcut)}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted/30 rounded-b-lg">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1 py-0.5 text-xs font-mono bg-muted rounded border border-border">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
