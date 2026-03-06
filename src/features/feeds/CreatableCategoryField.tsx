import { Input } from '@/components/ui/input';
import type { Category } from '../../types';

interface CreatableCategoryFieldProps {
  inputId: string;
  value: string;
  options: Category[];
  onChange: (value: string) => void;
}

export default function CreatableCategoryField({
  inputId,
  value,
  options,
  onChange,
}: CreatableCategoryFieldProps) {
  return (
    <>
      <Input
        id={inputId}
        list="feed-category-options"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入分类或选择已有分类"
        autoComplete="off"
      />
      <datalist id="feed-category-options">
        {options.map((option) => (
          <option key={option.id} value={option.name} />
        ))}
      </datalist>
    </>
  );
}
