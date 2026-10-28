import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

interface PromptRequest {
  title: string;
  message?: string;
  /** Text to edit; omit for a plain confirmation with no input. */
  initial?: string;
  confirmLabel: string;
  resolve: (value: string | undefined) => void;
}

const usePrompt = create<{ request?: PromptRequest }>(() => ({}));

/** Asks for one line of text; resolves undefined when cancelled. */
export function prompt(options: {
  title: string;
  message?: string;
  initial?: string;
  confirmLabel?: string;
}) {
  return new Promise<string | undefined>((resolve) => {
    usePrompt.setState({
      request: { initial: '', confirmLabel: 'OK', ...options, resolve },
    });
  });
}

/** Asks a yes/no question; resolves true when confirmed. */
export async function confirm(options: { title: string; message?: string; confirmLabel?: string }) {
  const answer = await new Promise<string | undefined>((resolve) => {
    usePrompt.setState({ request: { confirmLabel: 'OK', ...options, resolve } });
  });
  return answer !== undefined;
}

export function DialogHost() {
  const request = usePrompt((s) => s.request);
  if (!request) return null;
  return <PromptDialog key={request.title + (request.initial ?? '')} request={request} />;
}

function PromptDialog({ request }: { request: PromptRequest }) {
  const asking = request.initial !== undefined;
  const [value, setValue] = useState(request.initial ?? '');
  const input = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!asking) return submit.current?.focus();
    input.current?.focus();
    input.current?.select();
  }, [asking]);

  const close = (result: string | undefined) => {
    usePrompt.setState({ request: undefined });
    request.resolve(result);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={() => close(undefined)}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!asking) close('');
          else if (value.trim()) close(value.trim());
        }}
        onKeyDown={(e) => e.key === 'Escape' && close(undefined)}
      >
        <h2>{request.title}</h2>
        {request.message && <p>{request.message}</p>}
        {asking && (
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
          />
        )}
        <div className="buttons">
          <button type="button" className="btn" onClick={() => close(undefined)}>
            Cancel
          </button>
          <button
            ref={submit}
            type="submit"
            className="btn primary"
            disabled={asking && !value.trim()}
          >
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
