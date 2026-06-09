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
      <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 rounded-lg min-h-[42px] focus-within:ring-2 focus-within:ring-amber-300 focus-within:border-transparent">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-gray-400 hover:text-gray-700 leading-none"
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
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder-gray-400"
        />
      </div>

      {open && (input ? filtered : suggestions.filter((s) => !value.includes(s))).length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
          {(input ? filtered : suggestions.filter((s) => !value.includes(s))).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
            >
              {s}
            </button>
          ))}
          {input && !suggestions.includes(input.trim()) && input.trim() && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(input); }}
              className="w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 first:rounded-t-lg last:rounded-b-lg border-t border-gray-100"
            >
              + Create &ldquo;{input.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
