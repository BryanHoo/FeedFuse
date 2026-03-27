import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';
import { Button } from './button';
import { Input } from './input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Switch } from './switch';
import { Tabs, TabsList, TabsTrigger } from './tabs';
import { Textarea } from './textarea';

describe('flat interactive primitives', () => {
  it('renders button variants without shadows and exposes compact size', () => {
    render(
      <>
        <Button>默认</Button>
        <Button variant="secondary" size="compact">
          紧凑
        </Button>
        <Button variant="outline">描边</Button>
      </>,
    );

    expect(
      screen.getByRole('button', { name: '默认' }).className,
    ).not.toContain('shadow-');
    expect(screen.getByRole('button', { name: '紧凑' })).toHaveClass('h-8');
    expect(
      screen.getByRole('button', { name: '描边' }).className,
    ).not.toContain('shadow-');
  });

  it('renders text inputs without field shadows', () => {
    render(
      <>
        <Input aria-label="输入框" />
        <Textarea aria-label="多行输入框" />
        <Select defaultValue="15">
          <SelectTrigger aria-label="抓取间隔">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">每 15 分钟</SelectItem>
          </SelectContent>
        </Select>
      </>,
    );

    expect(screen.getByLabelText('输入框').className).not.toContain('shadow-');
    expect(screen.getByLabelText('多行输入框').className).not.toContain('shadow-');
    expect(
      screen.getByRole('combobox', { name: '抓取间隔' }).className,
    ).not.toContain('shadow-');
  });

  it('keeps switches, tabs and badges free of shadow classes', () => {
    render(
      <>
        <Switch aria-label="开关" checked={false} onCheckedChange={() => {}} />
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">通用</TabsTrigger>
          </TabsList>
        </Tabs>
        <Badge>标签</Badge>
      </>,
    );

    expect(screen.getByRole('switch', { name: '开关' }).className).not.toContain(
      'shadow-sm',
    );
    expect(
      screen.getByRole('switch', { name: '开关' }).querySelector('span')
        ?.className,
    ).not.toContain('shadow');
    expect(screen.getByRole('tab', { name: '通用' }).className).not.toContain(
      'shadow-',
    );
    expect(screen.getByText('标签').className).not.toContain('shadow-');
  });
});
