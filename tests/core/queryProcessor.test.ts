import {
  parseQueryParams,
  validateSortFields,
  applyPagination,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../src/core/queryProcessor';

// Helpers
function makeItems(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
    status: i % 2 === 0 ? 'active' : 'inactive',
    score: i + 1,
    createdAt: `2024-01-${String(i + 1).padStart(2, '0')}`,
    email: `user${i + 1}@example.com`,
  }));
}

describe('parseQueryParams', () => {
  it('returns defaults when no query params supplied', () => {
    const result = parseQueryParams({});
    expect(result).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: [],
      exactFilters: {},
      likeFilters: {},
      fromFilters: {},
      toFilters: {},
    });
  });

  it('parses page and pageSize', () => {
    const result = parseQueryParams({ page: '2', pageSize: '50' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
    }
  });

  it('returns error for non-integer page', () => {
    const result = parseQueryParams({ page: '1.5' });
    expect('error' in result).toBe(true);
  });

  it('returns error for page < 1', () => {
    const result = parseQueryParams({ page: '0' });
    expect('error' in result).toBe(true);
  });

  it('returns error for pageSize exceeding MAX_PAGE_SIZE', () => {
    const result = parseQueryParams({ pageSize: String(MAX_PAGE_SIZE + 1) });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/pageSize/);
    }
  });

  it('parses a single sort entry', () => {
    const result = parseQueryParams({ sort: 'name:asc' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.sort).toEqual([{ field: 'name', dir: 'asc' }]);
    }
  });

  it('parses multiple sort entries', () => {
    const result = parseQueryParams({ sort: 'createdAt:desc,name:asc' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.sort).toEqual([
        { field: 'createdAt', dir: 'desc' },
        { field: 'name', dir: 'asc' },
      ]);
    }
  });

  it('returns error for invalid sort direction', () => {
    const result = parseQueryParams({ sort: 'name:random' });
    expect('error' in result).toBe(true);
  });

  it('returns error for sort entry without colon', () => {
    const result = parseQueryParams({ sort: 'name' });
    expect('error' in result).toBe(true);
  });

  it('parses exact filters', () => {
    const result = parseQueryParams({ status: 'active' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.exactFilters).toEqual({ status: 'active' });
    }
  });

  it('parses _like filters', () => {
    const result = parseQueryParams({ email_like: '@example.com' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.likeFilters).toEqual({ email: '@example.com' });
    }
  });

  it('parses _from and _to filters', () => {
    const result = parseQueryParams({ createdAt_from: '2024-01-01', createdAt_to: '2024-12-31' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.fromFilters).toEqual({ createdAt: '2024-01-01' });
      expect(result.toFilters).toEqual({ createdAt: '2024-12-31' });
    }
  });
});

describe('validateSortFields', () => {
  const allowed = new Set(['id', 'name', 'score']);

  it('returns null for valid fields', () => {
    expect(validateSortFields([{ field: 'name', dir: 'asc' }], allowed)).toBeNull();
  });

  it('returns error message for unknown field', () => {
    const msg = validateSortFields([{ field: 'unknown', dir: 'asc' }], allowed);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/unknown/);
  });

  it('returns null for empty sort array', () => {
    expect(validateSortFields([], allowed)).toBeNull();
  });
});

describe('applyPagination', () => {
  const baseParams = {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: [],
    exactFilters: {},
    likeFilters: {},
    fromFilters: {},
    toFilters: {},
  };

  describe('pagination', () => {
    it('returns first page by default', () => {
      const pool = makeItems(50);
      const result = applyPagination(pool, baseParams);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(DEFAULT_PAGE_SIZE);
      expect(result.meta.total).toBe(50);
      expect(result.meta.totalPages).toBe(3); // ceil(50/20)
      expect(result.data).toHaveLength(DEFAULT_PAGE_SIZE);
    });

    it('returns correct items for page 2', () => {
      const pool = makeItems(50);
      const result = applyPagination(pool, { ...baseParams, page: 2, pageSize: 10 });
      expect(result.data).toHaveLength(10);
      expect(result.data[0]).toHaveProperty('id', 11);
    });

    it('clamps page to totalPages when page is too high', () => {
      const pool = makeItems(5);
      const result = applyPagination(pool, { ...baseParams, page: 99, pageSize: 10 });
      expect(result.meta.page).toBe(1);
      expect(result.data).toHaveLength(5);
    });

    it('handles empty pool', () => {
      const result = applyPagination([], baseParams);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(1);
      expect(result.data).toHaveLength(0);
    });

    it('returns partial last page', () => {
      const pool = makeItems(25);
      const result = applyPagination(pool, { ...baseParams, page: 3, pageSize: 10 });
      expect(result.data).toHaveLength(5);
      expect(result.meta.total).toBe(25);
    });
  });

  describe('filtering', () => {
    it('applies exact filter (string, case-insensitive)', () => {
      const pool = makeItems(10);
      const result = applyPagination(pool, {
        ...baseParams,
        exactFilters: { status: 'ACTIVE' },
      });
      result.data.forEach((item) => expect(item['status']).toBe('active'));
    });

    it('applies _like filter', () => {
      const pool = makeItems(10);
      const result = applyPagination(pool, {
        ...baseParams,
        likeFilters: { email: '@example.com' },
      });
      result.data.forEach((item) =>
        expect(String(item['email']).toLowerCase()).toContain('@example.com')
      );
    });

    it('applies _from date filter', () => {
      const pool = makeItems(10);
      const result = applyPagination(pool, {
        ...baseParams,
        fromFilters: { createdAt: '2024-01-05' },
      });
      result.data.forEach((item) => {
        const d = new Date(String(item['createdAt']));
        expect(d >= new Date('2024-01-05')).toBe(true);
      });
    });

    it('applies _to date filter', () => {
      const pool = makeItems(10);
      const result = applyPagination(pool, {
        ...baseParams,
        toFilters: { createdAt: '2024-01-05' },
      });
      result.data.forEach((item) => {
        const d = new Date(String(item['createdAt']));
        expect(d <= new Date('2024-01-05')).toBe(true);
      });
    });

    it('returns empty data when no items match filter', () => {
      const pool = makeItems(10);
      const result = applyPagination(pool, {
        ...baseParams,
        exactFilters: { status: 'deleted' },
      });
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('ignores filter for unknown field', () => {
      const pool = makeItems(5);
      const result = applyPagination(pool, {
        ...baseParams,
        exactFilters: { nonExistentField: 'value' },
      });
      // unknown field should not remove items
      expect(result.meta.total).toBe(5);
    });
  });

  describe('sorting', () => {
    it('sorts ascending by numeric field', () => {
      const pool = makeItems(5).reverse();
      const result = applyPagination(pool, {
        ...baseParams,
        sort: [{ field: 'score', dir: 'asc' }],
      });
      const scores = result.data.map((item) => item['score'] as number);
      expect(scores).toEqual([...scores].sort((a, b) => a - b));
    });

    it('sorts descending by numeric field', () => {
      const pool = makeItems(5);
      const result = applyPagination(pool, {
        ...baseParams,
        sort: [{ field: 'score', dir: 'desc' }],
      });
      const scores = result.data.map((item) => item['score'] as number);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    it('supports multi-field sort', () => {
      const pool = [
        { id: 1, status: 'active', score: 3 },
        { id: 2, status: 'active', score: 1 },
        { id: 3, status: 'inactive', score: 5 },
      ];
      const result = applyPagination(pool, {
        ...baseParams,
        sort: [
          { field: 'status', dir: 'asc' },
          { field: 'score', dir: 'asc' },
        ],
      });
      expect(result.data[0]).toHaveProperty('id', 2);
      expect(result.data[1]).toHaveProperty('id', 1);
      expect(result.data[2]).toHaveProperty('id', 3);
    });

    it('does not mutate the original pool', () => {
      const pool = makeItems(5).reverse();
      const originalFirst = pool[0];
      applyPagination(pool, { ...baseParams, sort: [{ field: 'score', dir: 'asc' }] });
      expect(pool[0]).toBe(originalFirst);
    });
  });
});
