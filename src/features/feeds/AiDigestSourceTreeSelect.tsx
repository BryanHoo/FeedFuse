'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import TreeSelect, { SHOW_CHILD } from 'rc-tree-select';
import { cn } from '@/lib/utils';
import type { Category, Feed } from '../../types';
import {
  buildAiDigestSourceTreeData,
  collectSelectedFeedIds,
  computeVisibleTagCount,
} from './aiDigestSourceTree.utils';
import styles from './AiDigestSourceTreeSelect.module.css';

interface AiDigestSourceTreeSelectProps {
  categories: Category[];
  feeds: Feed[];
  selectedFeedIds: string[];
  onChange: (nextSelectedFeedIds: string[]) => void;
  error?: string | null;
}

const TAG_WIDTH = 112;
const TAG_GAP = 8;
const TAG_SUFFIX_WIDTH = 56;

export default function AiDigestSourceTreeSelect({
  categories,
  feeds,
  selectedFeedIds,
  onChange,
  error,
}: AiDigestSourceTreeSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [maxTagCount, setMaxTagCount] = useState(1);
  const treeData = useMemo(() => buildAiDigestSourceTreeData({ categories, feeds }), [categories, feeds]);
  const value = useMemo(() => selectedFeedIds.map((feedId) => `feed:${feedId}`), [selectedFeedIds]);

  const handleValueChange = useCallback(
    (nextValue: unknown) => {
      const values = Array.isArray(nextValue) ? (nextValue as Array<string | number>) : [];
      onChange(collectSelectedFeedIds(values));
    },
    [onChange],
  );

  const recomputeMaxTagCount = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const nextTagCount = computeVisibleTagCount({
      containerWidth: node.clientWidth,
      tagWidth: TAG_WIDTH,
      gap: TAG_GAP,
      suffixWidth: TAG_SUFFIX_WIDTH,
    });
    setMaxTagCount(nextTagCount);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    recomputeMaxTagCount(node);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      recomputeMaxTagCount(node);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [recomputeMaxTagCount]);

  const placeholder = treeData.length > 0 ? '选择 RSS 来源' : '暂无可选 RSS 源';

  return (
    <div className={styles.container} ref={containerRef}>
      {/* 仅展示 RSS 叶子标签，分类节点仅用于联动选择。 */}
      <TreeSelect
        treeData={treeData}
        className={cn(styles.root, error ? styles.error : undefined)}
        dropdownClassName={styles.dropdown}
        value={value}
        onChange={handleValueChange}
        placeholder={placeholder}
        allowClear
        showSearch
        treeDefaultExpandAll
        treeCheckable
        showCheckedStrategy={SHOW_CHILD}
        treeNodeFilterProp="title"
        maxTagCount={maxTagCount}
        maxTagPlaceholder={(omittedValues) =>
          `...(+${Array.isArray(omittedValues) ? omittedValues.length : 0})` as ReactNode
        }
        disabled={treeData.length === 0}
      />
    </div>
  );
}
