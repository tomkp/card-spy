import { useState } from 'react';
import type { CardCommand, CommandParameter } from '../../shared/handlers/types';
import type { DetectedHandlerInfo } from '../../shared/types';
import { Button } from './ui/button';
import { ChevronDown, ChevronRight, Play, AlertTriangle } from 'lucide-react';

interface CommandPanelProps {
  handlers: DetectedHandlerInfo[];
  activeHandlerId: string | null;
  onSelectHandler: (handlerId: string) => void;
  onExecuteCommand: (commandId: string, parameters: Record<string, unknown>) => void;
}

interface CommandItemProps {
  command: CardCommand;
  onExecute: (parameters: Record<string, unknown>) => void;
}

function CommandItem({ command, onExecute }: CommandItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [parameters, setParameters] = useState<Record<string, string | number | boolean>>({});
  const [showConfirm, setShowConfirm] = useState(false);

  const hasParameters = command.parameters && command.parameters.length > 0;

  const handleExecute = () => {
    if (command.requiresConfirmation && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    onExecute(parameters);
    setShowConfirm(false);
  };

  const handleParameterChange = (param: CommandParameter, value: string) => {
    let parsedValue: string | number | boolean = value;
    if (param.type === 'number') {
      parsedValue = parseInt(value, 10) || 0;
    } else if (param.type === 'boolean') {
      parsedValue = value === 'true';
    }
    setParameters((prev) => ({ ...prev, [param.id]: parsedValue }));
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer"
        onClick={() => hasParameters && setIsExpanded(!isExpanded)}
      >
        {hasParameters ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )
        ) : (
          <div className="w-4" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{command.name}</span>
            {command.isDestructive && (
              <AlertTriangle className="h-3 w-3 text-destructive" />
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{command.description}</div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation();
            if (hasParameters && !isExpanded) {
              setIsExpanded(true);
            } else {
              handleExecute();
            }
          }}
        >
          <Play className="h-3 w-3" />
        </Button>
      </div>

      {hasParameters && isExpanded && (
        <div className="px-3 pb-3 pl-9 space-y-2">
          {command.parameters?.map((param) => (
            <div key={param.id} className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {param.name}
                {param.required && <span className="text-destructive ml-1">*</span>}
              </label>

              {param.type === 'select' ? (
                <select
                  className="w-full px-2 py-1 text-sm bg-background border border-input rounded"
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
                  className="w-full px-2 py-1 text-sm bg-background border border-input rounded"
                  value={String(parameters[param.id] ?? param.defaultValue ?? false)}
                  onChange={(e) => handleParameterChange(param, e.target.value)}
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              ) : (
                <input
                  type={param.type === 'number' ? 'number' : 'text'}
                  className="w-full px-2 py-1 text-sm bg-background border border-input rounded font-mono"
                  placeholder={param.description}
                  value={(parameters[param.id] as string) ?? param.defaultValue ?? ''}
                  onChange={(e) => handleParameterChange(param, e.target.value)}
                />
              )}
            </div>
          ))}

          <div className="pt-2">
            {showConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-warning">Are you sure?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={handleExecute}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" className="h-7" onClick={handleExecute}>
                <Play className="h-3 w-3 mr-1" />
                Execute
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface CommandCategoryProps {
  category: string;
  commands: CardCommand[];
  onExecute: (commandId: string, parameters: Record<string, unknown>) => void;
}

function CommandCategory({ category, commands, onExecute }: CommandCategoryProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border border-border rounded-md overflow-hidden mb-2">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span className="font-medium text-sm">{category}</span>
        <span className="text-xs text-muted-foreground">({commands.length})</span>
      </div>

      {isExpanded && (
        <div>
          {commands.map((cmd) => (
            <CommandItem
              key={cmd.id}
              command={cmd}
              onExecute={(params) => onExecute(cmd.id, params)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommandPanel({
  handlers,
  activeHandlerId,
  onSelectHandler,
  onExecuteCommand,
}: CommandPanelProps) {
  const activeHandler = handlers.find((h) => h.id === activeHandlerId);

  if (handlers.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Insert a card to see available commands
      </div>
    );
  }

  // Group commands by category
  const commandsByCategory = new Map<string, CardCommand[]>();
  if (activeHandler) {
    for (const cmd of activeHandler.commands) {
      const category = cmd.category || 'Other';
      if (!commandsByCategory.has(category)) {
        commandsByCategory.set(category, []);
      }
      commandsByCategory.get(category)!.push(cmd);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Handler selector */}
      {handlers.length > 1 && (
        <div className="p-2 border-b border-border">
          <select
            className="w-full px-2 py-1 text-sm bg-background border border-input rounded"
            value={activeHandlerId ?? ''}
            onChange={(e) => onSelectHandler(e.target.value)}
          >
            {handlers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.cardType ?? 'Unknown'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active handler info */}
      {activeHandler && (
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <div className="font-medium text-sm">{activeHandler.name}</div>
          <div className="text-xs text-muted-foreground">{activeHandler.cardType}</div>
        </div>
      )}

      {/* Commands list */}
      <div className="flex-1 overflow-auto p-2">
        {Array.from(commandsByCategory.entries()).map(([category, commands]) => (
          <CommandCategory
            key={category}
            category={category}
            commands={commands}
            onExecute={onExecuteCommand}
          />
        ))}
      </div>
    </div>
  );
}
