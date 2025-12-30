import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CardCommand, CommandParameter } from '../../shared/handlers/types';
import type { DetectedHandlerInfo } from '../../shared/types';
import { Button } from './ui/button';
import { ChevronLeft, AlertTriangle } from 'lucide-react';

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
      // Initialize with default values
      const defaults: Record<string, string | number | boolean> = {};
      command.parameters?.forEach((p) => {
        if (p.defaultValue !== undefined) {
          defaults[p.id] = p.defaultValue;
        }
      });
      setParameters(defaults);
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
    let parsedValue: string | number | boolean = value;
    if (param.type === 'number') {
      parsedValue = parseInt(value, 10) || 0;
    } else if (param.type === 'boolean') {
      parsedValue = value === 'true';
    }
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
      ) : (
        <>
          {/* Parameter form */}
          <div className="flex-1 overflow-auto p-3">
            {/* Back button and command name */}
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            <div className="mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{selectedCommand?.name}</h3>
                {selectedCommand?.isDestructive && (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCommand?.description}
              </p>
            </div>

            {/* Parameters */}
            {selectedCommand?.parameters?.map((param) => (
              <div key={param.id} className="mb-3">
                <label className="text-sm text-muted-foreground block mb-1">
                  {param.name}
                  {param.required && <span className="text-destructive ml-1">*</span>}
                </label>

                {param.type === 'select' ? (
                  <select
                    className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded font-mono"
                    value={(parameters[param.id] as string) ?? param.defaultValue ?? ''}
                    onChange={(e) => handleParameterChange(param, e.target.value)}
                  >
                    <option value="">Select...</option>
                    {param.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : param.type === 'boolean' ? (
                  <select
                    className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded"
                    value={String(parameters[param.id] ?? param.defaultValue ?? false)}
                    onChange={(e) => handleParameterChange(param, e.target.value)}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                ) : (
                  <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded font-mono"
                    placeholder={param.description}
                    value={(parameters[param.id] as string) ?? param.defaultValue ?? ''}
                    onChange={(e) => handleParameterChange(param, e.target.value)}
                  />
                )}
              </div>
            ))}

            {/* Confirmation / Execute */}
            {showConfirm ? (
              <div className="mt-4 p-3 border border-destructive/50 rounded bg-destructive/10">
                <p className="text-sm text-destructive mb-2">
                  {selectedCommand?.isDestructive
                    ? 'This action may cause data loss. Are you sure?'
                    : 'Confirm execution?'}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleExecute}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="w-full mt-4" onClick={handleExecute}>
                Execute
              </Button>
            )}
          </div>
          <CommandFooter view="parameters" />
        </>
      )}
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
