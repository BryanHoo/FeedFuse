'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Category } from '../../types';

interface CreatableCategoryFieldProps {
  inputId: string;
  value: string;
  options: Category[];
  onChange: (value: string) => void;
}

function normalizeCategoryText(value: string): string {
  return value.trim();
}

function normalizeCategoryKey(value: string): string {
  return normalizeCategoryText(value).toLowerCase();
}

export default function CreatableCategoryField({
  inputId,
  value,
  options,
  onChange,
}: CreatableCategoryFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [contentWidth, setContentWidth] = useState<number>();
  const normalizedInput = normalizeCategoryText(value);
  const normalizedInputKey = normalizeCategoryKey(value);
  const hasExactMatch = options.some((option) => normalizeCategoryKey(option.name) === normalizedInputKey);
  const filteredOptions = options.filter((option) => {
    if (!normalizedInputKey || hasExactMatch) return true;
    return normalizeCategoryKey(option.name).includes(normalizedInputKey);
  });
  const showCreateHint = Boolean(normalizedInput) && !hasExactMatch;

  useEffect(() => {
    if (!open) return;

    const updateContentWidth = () => {
      setContentWidth(wrapperRef.current?.getBoundingClientRect().width);
    };

    updateContentWidth();
    window.addEventListener('resize', updateContentWidth);

    return () => {
      window.removeEventListener('resize', updateContentWidth);
    };
  }, [open]);

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const resolveActiveIndex = (nextValue: string) => {
    const nextInputKey = normalizeCategoryKey(nextValue);
    const nextHasExactMatch = options.some((option) => normalizeCategoryKey(option.name) === nextInputKey);
    const nextFilteredOptions = options.filter((option) => {
      if (!nextInputKey || nextHasExactMatch) return true;
      return normalizeCategoryKey(option.name).includes(nextInputKey);
    });

    const nextSelectedIndex = nextFilteredOptions.findIndex(
      (option) => normalizeCategoryKey(option.name) === nextInputKey,
    );

    if (nextSelectedIndex >= 0) return nextSelectedIndex;
    return nextFilteredOptions.length > 0 ? 0 : -1;
  };

  const toggleSuggestions = () => {
    setOpen((current) => {
      const nextOpen = !current;
      setActiveIndex(nextOpen ? resolveActiveIndex(value) : -1);
      return nextOpen;
    });
    inputRef.current?.focus();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={wrapperRef} className="relative">
          <Input
            ref={inputRef}
            id={inputId}
            value={value}
            onChange={(event) => {
              const nextValue = event.target.value;
              onChange(nextValue);
              setOpen(true);
              setActiveIndex(resolveActiveIndex(nextValue));
            }}
            onFocus={() => {
              setOpen(true);
              setActiveIndex(resolveActiveIndex(value));
            }}
            onClick={() => {
              setOpen(true);
              setActiveIndex(resolveActiveIndex(value));
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => {
                  if (filteredOptions.length === 0) return -1;
                  if (!open || current < 0) return resolveActiveIndex(value);
                  return Math.min(current + 1, filteredOptions.length - 1);
                });
                return;
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => {
                  if (filteredOptions.length === 0) return -1;
                  if (!open || current < 0) return resolveActiveIndex(value);
                  if (current <= 0) return 0;
                  return current - 1;
                });
                return;
              }

              if (event.key === 'Enter' && open && activeIndex >= 0 && filteredOptions[activeIndex]) {
                event.preventDefault();
                selectOption(filteredOptions[activeIndex].name);
                return;
              }

              if (event.key === 'Escape' && open) {
                event.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="输入分类或选择已有分类"
            autoComplete="off"
            className="pr-10"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${inputId}-options`}
            aria-haspopup="listbox"
          />
          <Button
            type="button"
            variant="ghost"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-sm px-0 text-muted-foreground hover:text-foreground"
            aria-label={open ? '收起分类选项' : '展开分类选项'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleSuggestions}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        style={contentWidth ? { width: `${contentWidth}px` } : undefined}
        className="z-[60] p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <div
          id={`${inputId}-options`}
          role="listbox"
          aria-label="分类建议"
          className="max-h-64 overflow-y-auto"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => {
              const isSelected = normalizeCategoryKey(option.name) === normalizedInputKey;
              const isActive = index === activeIndex;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors',
                    isActive || isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/60 hover:text-accent-foreground',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option.name)}
                >
                  <span>{option.name}</span>
                  {isSelected ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })
          ) : (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              没有找到匹配的分类。继续输入并保存后会创建新分类。
            </div>
          )}
        </div>
        {showCreateHint ? (
          <div className="border-t border-border px-2 pb-1 pt-2 text-xs text-muted-foreground">
            保存后会创建新分类“{normalizedInput}”。
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
