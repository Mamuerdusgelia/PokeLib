'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { normalizeTags } from '@/lib/domain';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';

export function TagPicker({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [value, setValue] = useState('');
  const text = value.trim().replace(/\s+/g, ' ');
  const all = [
    ...new Map(
      [...suggestions, ...tags].map((s) => [s.toLowerCase(), s]),
    ).values(),
  ];
  const exact = all.find((s) => s.toLowerCase() === text.toLowerCase());
  const items = all.filter(
    (s) =>
      !tags.some((t) => t.toLowerCase() === s.toLowerCase()) &&
      s.toLowerCase().includes(text.toLowerCase()),
  );
  if (text && !exact && text.length <= 60) items.push(text);
  function add(s: string) {
    if (!s.trim()) return;
    const existing = all.find((x) => x.toLowerCase() === s.toLowerCase());
    onChange(normalizeTags([...tags, existing || s]));
    setValue('');
    setOpen(false);
  }
  return (
    <div className="tag-picker">
      {tags.map((tag) => (
        <span className="tag applied-tag" key={tag}>
          {tag}
          <button
            type="button"
            aria-label={'Remove tag ' + tag}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
          >
            <X size={14} />
          </button>
        </span>
      ))}
      {!open ? (
        <button
          type="button"
          className="add-tag"
          disabled={tags.length >= 30}
          onClick={() => setOpen(true)}
        >
          <Plus size={14} /> Add tag
        </button>
      ) : (
        <div className="tag-picker-input">
          <Combobox
            items={items}
            filter={null}
            value={null}
            inputValue={value}
            onInputValueChange={setValue}
            open={open}
            onOpenChange={setOpen}
            onValueChange={(v) => v && add(v)}
          >
            {/* Focus follows the user’s explicit Add tag action. */}
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
            <ComboboxInput
              autoFocus
              showTrigger={false}
              aria-label="Find or create tag"
              placeholder="Type a tag name…"
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text) {
                  e.preventDefault();
                  add(exact || text);
                }
              }}
            />
            <ComboboxContent className="tag-suggestions">
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {all.some((s) => s.toLowerCase() === item.toLowerCase())
                      ? item
                      : '+ Create “' + item + '”'}
                  </ComboboxItem>
                )}
              </ComboboxList>
              {!items.length && (
                <p className="picker-hint">
                  {exact ? 'Already applied' : 'Type a name to create a tag'}
                </p>
              )}
            </ComboboxContent>
          </Combobox>
        </div>
      )}
    </div>
  );
}
