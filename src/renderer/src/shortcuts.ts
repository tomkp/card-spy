import { useEffect } from 'react';
import { explore, resumeScript, runScript, saveScript, stopScript } from './actions';
import { EXPLORER_TAB, get, set } from './store';

/**
 * ⌘/Ctrl+Enter run · F10 step · F5 run or continue · Shift+F5 stop
 * ⌘/Ctrl+S save · ⌘/Ctrl+E explore · ⌘/Ctrl+K focus the APDU console
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const { activeTab, run } = get();
      const script = activeTab === EXPLORER_TAB ? undefined : activeTab;
      const mod = e.metaKey || e.ctrlKey;
      let handled = true;

      if (e.key === 'F5' && e.shiftKey) stopScript();
      else if (e.key === 'F5')
        run?.paused ? resumeScript(false) : script && !run && runScript(script);
      else if (e.key === 'F10')
        run?.paused ? resumeScript(true) : script && !run && runScript(script, true);
      else if (mod && e.key === 'Enter' && script && !run) runScript(script);
      else if (mod && e.key.toLowerCase() === 's' && script) void saveScript(script);
      else if (mod && e.key.toLowerCase() === 'e' && !run) void explore();
      else if (mod && e.key.toLowerCase() === 'k') focusConsole();
      else handled = false;

      if (handled) e.preventDefault();
    };
    // Capture phase, so F5/F10 work while Monaco has focus.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

function focusConsole(): void {
  set({ bottomTab: 'trace' });
  requestAnimationFrame(() => document.getElementById('console-input')?.focus());
}
