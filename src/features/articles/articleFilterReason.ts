export function getFilteredReasonLabel(filteredBy?: string[] | null): string {
  if (filteredBy?.includes('duplicate')) {
    return '已过滤 · 重复/相似转载';
  }

  if (filteredBy?.includes('keyword')) {
    return '已过滤 · 关键词';
  }

  if (filteredBy?.includes('ai')) {
    return '已过滤 · AI';
  }

  return '已过滤';
}
