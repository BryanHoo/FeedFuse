export interface ArticleVirtualWindowInput {
  rowHeights: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan: number;
}

export interface ArticleVirtualWindow {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
}

export interface ArticleVirtualAnchorRow {
  key: string;
  height: number;
}

function buildHeightOffsets(rowHeights: number[]) {
  // Prefix heights let us locate rows from scroll offsets without scanning every DOM node.
  const offsets = new Array(rowHeights.length + 1).fill(0);

  for (let index = 0; index < rowHeights.length; index += 1) {
    offsets[index + 1] = offsets[index] + rowHeights[index];
  }

  return offsets;
}

function findRowIndexAtOffset(offsets: number[], scrollOffset: number) {
  const rowCount = offsets.length - 1;
  if (rowCount <= 0) return -1;

  let low = 0;
  let high = rowCount - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const rowTop = offsets[mid];
    const rowBottom = offsets[mid + 1];

    if (scrollOffset < rowTop) {
      high = mid - 1;
      continue;
    }

    if (scrollOffset >= rowBottom) {
      low = mid + 1;
      continue;
    }

    return mid;
  }

  return Math.max(0, Math.min(rowCount - 1, low));
}

export function getArticleVirtualWindow(input: ArticleVirtualWindowInput): ArticleVirtualWindow {
  if (input.rowHeights.length === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const offsets = buildHeightOffsets(input.rowHeights);
  const totalHeight = offsets[offsets.length - 1];
  const maxVisibleOffset = Math.max(input.scrollTop, input.scrollTop + input.viewportHeight - 1);
  const visibleStartIndex = findRowIndexAtOffset(offsets, Math.max(0, input.scrollTop));
  const visibleEndIndex = findRowIndexAtOffset(
    offsets,
    Math.max(0, Math.min(maxVisibleOffset, Math.max(0, totalHeight - 1))),
  );
  const startIndex = Math.max(0, visibleStartIndex - input.overscan);
  const endIndex = Math.min(input.rowHeights.length - 1, visibleEndIndex + input.overscan);

  return {
    startIndex,
    endIndex,
    topSpacerHeight: offsets[startIndex],
    bottomSpacerHeight: totalHeight - offsets[endIndex + 1],
  };
}

export function getArticleVirtualAnchorCompensation(input: {
  previousRows: ArticleVirtualAnchorRow[];
  nextRows: ArticleVirtualAnchorRow[];
  previousScrollTop: number;
}): number | null {
  if (input.previousRows.length === 0 || input.nextRows.length === 0) {
    return null;
  }

  const previousHeights = input.previousRows.map((row) => row.height);
  const previousOffsets = buildHeightOffsets(previousHeights);
  const previousAnchorIndex = findRowIndexAtOffset(previousOffsets, Math.max(0, input.previousScrollTop));
  if (previousAnchorIndex < 0) {
    return null;
  }

  const anchorRow = input.previousRows[previousAnchorIndex];
  const anchorOffset = input.previousScrollTop - previousOffsets[previousAnchorIndex];
  const nextAnchorIndex = input.nextRows.findIndex((row) => row.key === anchorRow.key);
  if (nextAnchorIndex < 0) {
    return null;
  }

  const nextOffsets = buildHeightOffsets(input.nextRows.map((row) => row.height));
  const clampedAnchorOffset = Math.min(anchorOffset, input.nextRows[nextAnchorIndex].height);

  return nextOffsets[nextAnchorIndex] + clampedAnchorOffset;
}
