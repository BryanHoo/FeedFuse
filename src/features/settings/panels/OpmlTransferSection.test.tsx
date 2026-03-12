import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OpmlTransferSection from './OpmlTransferSection';

describe('OpmlTransferSection', () => {
  it('uses Chinese accessible names for import/export actions', () => {
    render(
      <OpmlTransferSection
        importing={false}
        exporting={false}
        lastImportResult={null}
        onImport={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '导入 OPML' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出 OPML' })).toBeInTheDocument();
  });

  it('passes the selected file to onImport and renders summary counts', () => {
    const onImport = vi.fn();

    render(
      <OpmlTransferSection
        importing={false}
        exporting={false}
        lastImportResult={{
          importedCount: 2,
          duplicateCount: 1,
          invalidCount: 1,
          createdCategoryCount: 1,
        }}
        onImport={onImport}
        onExport={vi.fn()}
      />,
    );

    const input = screen.getByTestId('opml-file-input');
    const file = new File(['<opml />'], 'feeds.opml', { type: 'text/xml' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onImport).toHaveBeenCalledWith(file);
    expect(screen.getByText('已导入 2 个订阅')).toBeInTheDocument();
  });
});
