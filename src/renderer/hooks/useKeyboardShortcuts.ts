import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

/**
 * Hook for registering global keyboard shortcuts.
 * Supports Cmd (Mac) / Ctrl (Win/Linux) modifier.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields (unless it's a global shortcut)
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modifierKey = isMac ? event.metaKey : event.ctrlKey;

        // Check if the modifier requirement matches
        const wantsModifier = shortcut.meta || shortcut.ctrl;
        const hasCorrectModifier = wantsModifier ? modifierKey : !modifierKey;

        // Check other modifiers
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        // Check key match (case insensitive)
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (keyMatch && hasCorrectModifier && shiftMatch && altMatch) {
          // For shortcuts with modifiers, always trigger (even in inputs)
          // For shortcuts without modifiers, only trigger outside inputs
          if (wantsModifier || !isInputField) {
            event.preventDefault();
            shortcut.action();
            return;
          }
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Get the display string for a shortcut (e.g., "⌘I" or "Ctrl+I")
 */
export function getShortcutDisplay(shortcut: Omit<KeyboardShortcut, 'action' | 'description'>): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const parts: string[] = [];

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }

  // Capitalize the key for display
  const displayKey = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(displayKey);

  return isMac ? parts.join('') : parts.join('+');
}
