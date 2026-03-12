import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportOpml, importOpml } from './opmlService';

const listCategoriesMock = vi.fn();
const listFeedsMock = vi.fn();
const createFeedWithCategoryResolutionMock = vi.fn();

vi.mock('../repositories/categoriesRepo', () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
}));

vi.mock('../repositories/feedsRepo', () => ({
  listFeeds: (...args: unknown[]) => listFeedsMock(...args),
}));

vi.mock('./feedCategoryLifecycleService', () => ({
  createFeedWithCategoryResolution: (...args: unknown[]) =>
    createFeedWithCategoryResolutionMock(...args),
}));

const pool = {} as Pool;

const VALID_OPML = `
  <?xml version="1.0"?>
  <opml version="2.0">
    <body>
      <outline text="Tech">
        <outline text="Existing" xmlUrl="https://example.com/a.xml" />
        <outline text="New" xmlUrl="https://example.com/b.xml" />
      </outline>
    </body>
  </opml>
`;

const OPML_WITH_HTML_URL = `
  <?xml version="1.0"?>
  <opml version="2.0">
    <body>
      <outline text="Tech">
        <outline
          text="New"
          xmlUrl="https://example.com/b.xml"
          htmlUrl="https://example.com/blog"
        />
      </outline>
    </body>
  </opml>
`;

describe('importOpml', () => {
  beforeEach(() => {
    listCategoriesMock.mockReset();
    listFeedsMock.mockReset();
    createFeedWithCategoryResolutionMock.mockReset();
  });

  it('returns a structured success result when the document is valid but empty', async () => {
    listFeedsMock.mockResolvedValue([]);
    listCategoriesMock.mockResolvedValue([]);

    const result = await importOpml(pool, {
      content: '<?xml version="1.0"?><opml version="2.0"><body /></opml>',
    });

    expect(result).toMatchObject({
      importedCount: 0,
      duplicateCount: 0,
      invalidCount: 0,
      createdCategoryCount: 0,
      duplicates: [],
      invalidItems: [],
    });
  });

  it('skips existing feed urls and only creates new feeds through createFeedWithCategoryResolution', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([
      {
        id: 'feed-1',
        title: 'Existing',
        url: 'https://example.com/a.xml',
        siteUrl: null,
        iconUrl: null,
        enabled: true,
        fullTextOnOpenEnabled: false,
        aiSummaryOnOpenEnabled: false,
        aiSummaryOnFetchEnabled: false,
        bodyTranslateOnFetchEnabled: false,
        bodyTranslateOnOpenEnabled: false,
        titleTranslateEnabled: false,
        bodyTranslateEnabled: false,
        articleListDisplayMode: 'card',
        categoryId: null,
        fetchIntervalMinutes: 30,
        lastFetchStatus: null,
        lastFetchError: null,
      },
    ]);
    createFeedWithCategoryResolutionMock.mockResolvedValue({
      id: 'feed-2',
      title: 'New',
      url: 'https://example.com/b.xml',
      siteUrl: null,
      iconUrl: null,
      enabled: true,
      fullTextOnOpenEnabled: false,
      aiSummaryOnOpenEnabled: false,
      aiSummaryOnFetchEnabled: false,
      bodyTranslateOnFetchEnabled: false,
      bodyTranslateOnOpenEnabled: false,
      titleTranslateEnabled: false,
      bodyTranslateEnabled: false,
      articleListDisplayMode: 'card',
      categoryId: 'cat-tech',
      fetchIntervalMinutes: 30,
      lastFetchStatus: null,
      lastFetchError: null,
    });

    const result = await importOpml(pool, { content: VALID_OPML });

    expect(createFeedWithCategoryResolutionMock).toHaveBeenCalledTimes(1);
    expect(createFeedWithCategoryResolutionMock).toHaveBeenCalledWith(pool, {
      title: 'New',
      url: 'https://example.com/b.xml',
      siteUrl: null,
      iconUrl: null,
      categoryName: 'Tech',
    });
    expect(result).toMatchObject({
      importedCount: 1,
      duplicateCount: 1,
      invalidCount: 0,
      createdCategoryCount: 1,
    });
    expect(result.duplicates).toEqual([
      {
        title: 'Existing',
        xmlUrl: 'https://example.com/a.xml',
        reason: 'duplicate_in_db',
      },
    ]);
  });

  it('imports htmlUrl as siteUrl and derives iconUrl for imported feeds', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);
    createFeedWithCategoryResolutionMock.mockResolvedValue({
      id: 'feed-2',
      title: 'New',
      url: 'https://example.com/b.xml',
      siteUrl: 'https://example.com/blog',
      iconUrl:
        'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fexample.com',
      enabled: true,
      fullTextOnOpenEnabled: false,
      aiSummaryOnOpenEnabled: false,
      aiSummaryOnFetchEnabled: false,
      bodyTranslateOnFetchEnabled: false,
      bodyTranslateOnOpenEnabled: false,
      titleTranslateEnabled: false,
      bodyTranslateEnabled: false,
      articleListDisplayMode: 'card',
      categoryId: 'cat-tech',
      fetchIntervalMinutes: 30,
      lastFetchStatus: null,
      lastFetchError: null,
    });

    await importOpml(pool, { content: OPML_WITH_HTML_URL });

    expect(createFeedWithCategoryResolutionMock).toHaveBeenCalledWith(pool, {
      title: 'New',
      url: 'https://example.com/b.xml',
      siteUrl: 'https://example.com/blog',
      iconUrl:
        'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fexample.com',
      categoryName: 'Tech',
    });
  });
});

describe('exportOpml', () => {
  beforeEach(() => {
    listCategoriesMock.mockReset();
    listFeedsMock.mockReset();
  });

  it('builds XML from current feeds and categories and returns a stable filename', async () => {
    listCategoriesMock.mockResolvedValue([{ id: 'cat-tech', name: 'Tech', position: 0 }]);
    listFeedsMock.mockResolvedValue([
      {
        id: 'feed-1',
        title: 'Alpha',
        url: 'https://example.com/a.xml',
        siteUrl: null,
        iconUrl: null,
        enabled: true,
        fullTextOnOpenEnabled: false,
        aiSummaryOnOpenEnabled: false,
        aiSummaryOnFetchEnabled: false,
        bodyTranslateOnFetchEnabled: false,
        bodyTranslateOnOpenEnabled: false,
        titleTranslateEnabled: false,
        bodyTranslateEnabled: false,
        articleListDisplayMode: 'card',
        categoryId: 'cat-tech',
        fetchIntervalMinutes: 30,
        lastFetchStatus: null,
        lastFetchError: null,
      },
    ]);

    const result = await exportOpml(pool);

    expect(result.fileName).toBe('feedfuse-subscriptions.opml');
    expect(result.xml).toContain('<opml version="2.0">');
  });
});
