import { describe, expect, it } from 'vitest';
import { buildOpmlDocument, parseOpmlDocument } from './opmlDocument';

describe('parseOpmlDocument', () => {
  it('uses the nearest outline ancestor as category and falls back title to xmlUrl', () => {
    const parsed = parseOpmlDocument(`
      <?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline text="Top">
            <outline text="Leaf">
              <outline xmlUrl="https://example.com/feed.xml" />
            </outline>
          </outline>
        </body>
      </opml>
    `);

    expect(parsed.entries).toEqual([
      {
        title: 'https://example.com/feed.xml',
        xmlUrl: 'https://example.com/feed.xml',
        siteUrl: null,
        category: 'Leaf',
      },
    ]);
  });

  it('parses htmlUrl into siteUrl when present', () => {
    const parsed = parseOpmlDocument(`
      <?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline
            text="Example"
            xmlUrl="https://example.com/feed.xml"
            htmlUrl="https://example.com/blog"
          />
        </body>
      </opml>
    `);

    expect(parsed.entries).toEqual([
      {
        title: 'Example',
        xmlUrl: 'https://example.com/feed.xml',
        siteUrl: 'https://example.com/blog',
        category: null,
      },
    ]);
  });

  it('keeps invalid or duplicate candidates in structured buckets instead of throwing', () => {
    const parsed = parseOpmlDocument(`
      <?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline xmlUrl="notaurl" text="Bad" />
          <outline xmlUrl="https://example.com/feed.xml" text="One" />
          <outline xmlUrl="https://example.com/feed.xml" text="Two" />
        </body>
      </opml>
    `);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.invalidItems[0]?.reason).toBe('invalid_url');
    expect(parsed.duplicateItems[0]?.xmlUrl).toBe('https://example.com/feed.xml');
  });
});

describe('buildOpmlDocument', () => {
  it('serializes categorized feeds before uncategorized feeds in deterministic order', () => {
    const xml = buildOpmlDocument({
      title: 'FeedFuse Subscriptions',
      categories: [{ id: 'cat-tech', name: 'Tech', position: 0 }],
      feeds: [
        {
          id: 'feed-1',
          title: 'Alpha',
          url: 'https://example.com/a.xml',
          siteUrl: null,
          categoryId: 'cat-tech',
        },
        {
          id: 'feed-2',
          title: 'Beta',
          url: 'https://example.com/b.xml',
          siteUrl: 'https://example.com',
          categoryId: null,
        },
      ],
    });

    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain('xmlUrl="https://example.com/a.xml"');
    expect(xml).toContain('htmlUrl="https://example.com/"');
    expect(xml.indexOf('text="Tech"')).toBeLessThan(xml.indexOf('text="Beta"'));
  });
});
