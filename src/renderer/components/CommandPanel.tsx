import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CardCommand, CommandParameter } from '../../shared/handlers/types';
import type { DetectedHandlerInfo } from '../../shared/types';
import { AlertTriangle } from 'lucide-react';
import { ParameterForm, parseParameterValue, initializeParameters } from './ParameterForm';

interface CommandPanelProps {
  handlers: DetectedHandlerInfo[];
  activeHandlerId: string | null;
  onSelectHandler: (handlerId: string) => void;
  onExecuteCommand: (commandId: string, parameters: Record<string, unknown>) => void;
}

type View = 'commands' | 'parameters';

export function CommandPanel({
  handlers,
  activeHandlerId,
  onSelectHandler,
  onExecuteCommand,
}: CommandPanelProps) {
  const activeHandler = handlers.find((h) => h.id === activeHandlerId);
  const commands = useMemo(() => activeHandler?.commands || [], [activeHandler?.commands]);

  // Use key to reset state when handler changes
  const stateKey = `${activeHandlerId}-${commands.length}`;

  return (
    <CommandPanelInner
      key={stateKey}
      handlers={handlers}
      activeHandlerId={activeHandlerId}
      onSelectHandler={onSelectHandler}
      onExecuteCommand={onExecuteCommand}
      commands={commands}
    />
  );
}

interface CommandPanelInnerProps extends CommandPanelProps {
  commands: CardCommand[];
}

function CommandPanelInner({
  handlers,
  activeHandlerId,
  onSelectHandler,
  onExecuteCommand,
  commands,
}: CommandPanelInnerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<View>('commands');
  const [selectedCommand, setSelectedCommand] = useState<CardCommand | null>(null);
  const [parameters, setParameters] = useState<Record<string, string | number | boolean>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleBack = useCallback(() => {
    setView('commands');
    setSelectedCommand(null);
    setParameters({});
    setShowConfirm(false);
  }, []);

  const handleExecute = useCallback(() => {
    if (!selectedCommand) return;

    if (selectedCommand.requiresConfirmation && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    onExecuteCommand(selectedCommand.id, parameters);
    handleBack();
  }, [selectedCommand, showConfirm, parameters, onExecuteCommand, handleBack]);

  const handleSelectCommand = useCallback((command: CardCommand) => {
    if (!command) return;

    const hasParameters = command.parameters && command.parameters.length > 0;

    if (hasParameters) {
      setParameters(initializeParameters(command));
      setSelectedCommand(command);
      setView('parameters');
      setShowConfirm(false);
    } else if (command.requiresConfirmation) {
      setSelectedCommand(command);
      setView('parameters');
      setShowConfirm(true);
    } else {
      onExecuteCommand(command.id, {});
    }
  }, [onExecuteCommand]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this panel is focused or no input is focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === 'INPUT' ||
                             activeElement?.tagName === 'SELECT' ||
                             activeElement?.tagName === 'TEXTAREA';

      if (isInputFocused && view !== 'parameters') return;

      if (view === 'commands') {
        switch (e.key) {
          case 'ArrowUp':
          case 'k':
            e.preventDefault();
            setSelectedIndex((i) => Math.max(0, i - 1));
            break;
          case 'ArrowDown':
          case 'j':
            e.preventDefault();
            setSelectedIndex((i) => Math.min(commands.length - 1, i + 1));
            break;
          case 'Enter':
            e.preventDefault();
            handleSelectCommand(commands[selectedIndex]);
            break;
        }
      } else if (view === 'parameters') {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleBack();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleExecute();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, selectedIndex, commands, handleSelectCommand, handleBack, handleExecute]);

  // Scroll selected item into view
  useEffect(() => {
    if (view === 'commands' && containerRef.current) {
      const selectedElement = containerRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, view]);

  const handleParameterChange = (param: CommandParameter, value: string) => {
    const parsedValue = parseParameterValue(param, value);
    setParameters((prev) => ({ ...prev, [param.id]: parsedValue }));
  };

  if (handlers.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center p-4 text-center text-muted-foreground text-sm">
          Insert a card to see available commands
        </div>
        <CommandFooter view="empty" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Handler selector - only show if multiple handlers */}
      {handlers.length > 1 && (
        <div className="p-2 border-b border-border">
          <select
            className="w-full px-2 py-1 text-sm bg-background border border-input rounded"
            value={activeHandlerId ?? ''}
            onChange={(e) => onSelectHandler(e.target.value)}
          >
            {handlers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {view === 'commands' ? (
        <>
          {/* Commands list */}
          <div ref={containerRef} className="flex-1 overflow-auto">
            {commands.map((cmd, index) => (
              <CommandRow
                key={cmd.id}
                command={cmd}
                isSelected={index === selectedIndex}
                onSelect={() => handleSelectCommand(cmd)}
                onHover={() => setSelectedIndex(index)}
                dataIndex={index}
              />
            ))}
          </div>
          <CommandFooter view="commands" />
        </>
      ) : selectedCommand ? (
        <>
          {/* Parameter form */}
          <div className="flex-1 overflow-auto">
            <ParameterForm
              command={selectedCommand}
              parameters={parameters}
              onParameterChange={handleParameterChange}
              onExecute={handleExecute}
              onBack={handleBack}
              showConfirm={showConfirm}
              onCancelConfirm={() => setShowConfirm(false)}
            />
          </div>
          <CommandFooter view="parameters" />
        </>
      ) : null}
    </div>
  );
}

interface CommandRowProps {
  command: CardCommand;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  dataIndex: number;
}

function CommandRow({ command, isSelected, onSelect, onHover, dataIndex }: CommandRowProps) {
  return (
    <div
      data-index={dataIndex}
      className={`px-3 py-2 cursor-pointer border-b border-border last:border-b-0 ${
        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{command.name}</span>
        {command.isDestructive && (
          <AlertTriangle className="h-3 w-3 text-destructive" />
        )}
      </div>
      <div className="text-xs text-muted-foreground">{command.description}</div>
    </div>
  );
}

function CommandFooter({ view }: { view: 'empty' | 'commands' | 'parameters' }) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="px-3 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
      {view === 'empty' && (
        <span>Waiting for card...</span>
      )}
      {view === 'commands' && (
        <div className="flex gap-3">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Select</span>
        </div>
      )}
      {view === 'parameters' && (
        <div className="flex gap-3">
          <span><kbd>Esc</kbd> Back</span>
          <span><kbd>{cmdKey}+Enter</kbd> Execute</span>
        </div>
      )}
    </div>
  );
}
