'use client';

import { useState, useRef, useEffect } from 'react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  onPendingChange?: (pending: string) => void;
}

export default function TagInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Add tag…',
  onPendingChange,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s),
  );

  const add = (tag: string) => {
    const t = tag.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
    setOpen(false);
    onPendingChange?.('');
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 border border-lexis-border rounded-lg min-h-[42px] focus-within:ring-2 focus-within:ring-lexis-accent focus-within:border-transparent">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-lexis-hover text-lexis-fg text-xs rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-lexis-muted hover:text-lexis-fg leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); onPendingChange?.(e.target.value); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (input.trim()) add(input); }
            if (e.key === 'Backspace' && !input && value.length) remove(value[value.length - 1]);
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent text-lexis-fg placeholder-lexis-muted"
        />
      </div>

      {open && (input ? filtered : suggestions.filter((s) => !value.includes(s))).length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-lexis-panel border border-lexis-border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
          {(input ? filtered : suggestions.filter((s) => !value.includes(s))).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s); }}
              className="w-full text-left px-3 py-2 text-sm text-lexis-fg hover:bg-lexis-hover first:rounded-t-lg last:rounded-b-lg"
            >
              {s}
            </button>
          ))}
          {input && !suggestions.includes(input.trim()) && input.trim() && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(input); }}
              className="w-full text-left px-3 py-2 text-sm text-lexis-accent hover:bg-lexis-accent-bg first:rounded-t-lg last:rounded-b-lg border-t border-lexis-border"
            >
              + Create &ldquo;{input.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
