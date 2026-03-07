/**
 * Query parameter parsing, validation, filtering, sorting and pagination
 * for list (array) endpoints.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** Size of the virtual "database" pool generated before filtering/pagination. */
export const POOL_SIZE = 100;

const RESERVED_PARAMS = new Set(['page', 'pageSize', 'sort']);

export interface SortEntry {
  field: string;
  dir: 'asc' | 'desc';
}

export interface ParsedQueryParams {
  page: number;
  pageSize: number;
  sort: SortEntry[];
  exactFilters: Record<string, string>;
  containsFilters: Record<string, string>;
  gteFilters: Record<string, string>;
  lteFilters: Record<string, string>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedResponse {
  data: Record<string, unknown>[];
  meta: PaginationMeta;
}

export type QueryParseError = { error: string };

/**
 * Parses and validates query parameters from an Express request.
 * Returns a ParsedQueryParams on success or a QueryParseError on invalid input.
 */
export function parseQueryParams(
  query: Record<string, string | string[] | undefined>
): ParsedQueryParams | QueryParseError {
  // page
  const rawPage = query['page'];
  let page = DEFAULT_PAGE;
  if (rawPage !== undefined) {
    const str = Array.isArray(rawPage) ? rawPage[0] ?? '' : rawPage;
    const p = Number(str);
    if (!Number.isInteger(p) || p < 1) {
      return { error: '"page" must be a positive integer' };
    }
    page = p;
  }

  // pageSize
  const rawPageSize = query['pageSize'];
  let pageSize = DEFAULT_PAGE_SIZE;
  if (rawPageSize !== undefined) {
    const str = Array.isArray(rawPageSize) ? rawPageSize[0] ?? '' : rawPageSize;
    const ps = Number(str);
    if (!Number.isInteger(ps) || ps < 1) {
      return { error: '"pageSize" must be a positive integer' };
    }
    if (ps > MAX_PAGE_SIZE) {
      return { error: `"pageSize" must not exceed ${MAX_PAGE_SIZE}` };
    }
    pageSize = ps;
  }

  // sort — comma-separated "field:dir" pairs
  const rawSort = query['sort'];
  const sort: SortEntry[] = [];
  if (rawSort !== undefined) {
    const sortStr = Array.isArray(rawSort) ? rawSort[0] ?? '' : rawSort;
    const parts = sortStr.split(',').filter(Boolean);
    for (const part of parts) {
      const colonIdx = part.lastIndexOf(':');
      if (colonIdx === -1) {
        return {
          error: `Invalid sort format "${part}". Expected "field:asc" or "field:desc"`,
        };
      }
      const field = part.slice(0, colonIdx).trim();
      const dir = part.slice(colonIdx + 1).trim().toLowerCase();
      if (dir !== 'asc' && dir !== 'desc') {
        return {
          error: `Invalid sort direction "${dir}" for field "${field}". Use "asc" or "desc"`,
        };
      }
      if (!field) {
        return { error: `Sort field name cannot be empty` };
      }
      sort.push({ field, dir });
    }
  }

  // filters — derived from remaining query params
  const exactFilters: Record<string, string> = {};
  const containsFilters: Record<string, string> = {};
  const gteFilters: Record<string, string> = {};
  const lteFilters: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_PARAMS.has(key) || value === undefined) continue;
    const strVal = Array.isArray(value) ? (value[0] ?? '') : value;

    if (key.endsWith('_contains')) {
      containsFilters[key.slice(0, -9)] = strVal;
    } else if (key.endsWith('_gte')) {
      gteFilters[key.slice(0, -4)] = strVal;
    } else if (key.endsWith('_lte')) {
      lteFilters[key.slice(0, -4)] = strVal;
    } else {
      exactFilters[key] = strVal;
    }
  }

  return { page, pageSize, sort, exactFilters, containsFilters, gteFilters, lteFilters };
}

/**
 * Validates that all sort fields exist in the schema.
 * Returns an error message string, or null if all fields are valid.
 */
export function validateSortFields(
  sort: SortEntry[],
  allowedFields: Set<string>
): string | null {
  for (const { field } of sort) {
    if (!allowedFields.has(field)) {
      return `Cannot sort by unknown field "${field}". Allowed fields: ${[...allowedFields].sort().join(', ')}`;
    }
  }
  return null;
}

function getFieldValue(item: Record<string, unknown>, field: string): unknown {
  return item[field];
}

function matchesExact(
  item: Record<string, unknown>,
  field: string,
  value: string
): boolean {
  const v = getFieldValue(item, field);
  if (v === undefined) return true; // unknown field — no constraint
  if (typeof v === 'string') return v.toLowerCase() === value.toLowerCase();
  if (typeof v === 'boolean') {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'true' && normalized !== 'false') return true; // invalid — ignore constraint
    return v === (normalized === 'true');
  }
  if (typeof v === 'number') {
    const numValue = Number(value);
    if (Number.isNaN(numValue)) return true; // invalid — ignore constraint
    return v === numValue;
  }
  return String(v) === value;
}

function matchesContains(
  item: Record<string, unknown>,
  field: string,
  value: string
): boolean {
  const v = getFieldValue(item, field);
  if (v === undefined) return true;
  return String(v).toLowerCase().includes(value.toLowerCase());
}

function matchesGte(
  item: Record<string, unknown>,
  field: string,
  value: string
): boolean {
  const v = getFieldValue(item, field);
  if (v === undefined) return true;
  if (typeof v === 'number') {
    const num = Number(value);
    return isNaN(num) ? true : v >= num;
  }
  const threshold = new Date(value);
  if (isNaN(threshold.getTime())) return true;
  const itemDate = new Date(String(v));
  if (isNaN(itemDate.getTime())) return true;
  return itemDate >= threshold;
}

function matchesLte(
  item: Record<string, unknown>,
  field: string,
  value: string
): boolean {
  const v = getFieldValue(item, field);
  if (v === undefined) return true;
  if (typeof v === 'number') {
    const num = Number(value);
    return isNaN(num) ? true : v <= num;
  }
  const threshold = new Date(value);
  if (isNaN(threshold.getTime())) return true;
  const itemDate = new Date(String(v));
  if (isNaN(itemDate.getTime())) return true;
  return itemDate <= threshold;
}

function applyFilters(
  items: Record<string, unknown>[],
  params: ParsedQueryParams
): Record<string, unknown>[] {
  return items.filter((item) => {
    for (const [field, value] of Object.entries(params.exactFilters)) {
      if (!matchesExact(item, field, value)) return false;
    }
    for (const [field, value] of Object.entries(params.containsFilters)) {
      if (!matchesContains(item, field, value)) return false;
    }
    for (const [field, value] of Object.entries(params.gteFilters)) {
      if (!matchesGte(item, field, value)) return false;
    }
    for (const [field, value] of Object.entries(params.lteFilters)) {
      if (!matchesLte(item, field, value)) return false;
    }
    return true;
  });
}

function applySort(
  items: Record<string, unknown>[],
  sort: SortEntry[]
): Record<string, unknown>[] {
  if (sort.length === 0) return items;
  return [...items].sort((a, b) => {
    for (const { field, dir } of sort) {
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      if (av === undefined || av === null) return dir === 'asc' ? 1 : -1;
      if (bv === undefined || bv === null) return dir === 'asc' ? -1 : 1;
      let cmp: number;
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv);
      } else {
        cmp = av < bv ? -1 : 1;
      }
      return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

/**
 * Filters, sorts, and paginates a pool of items according to the parsed query params.
 * Returns a PaginatedResponse with data and meta.
 */
export function applyPagination(
  pool: Record<string, unknown>[],
  params: ParsedQueryParams
): PaginatedResponse {
  const filtered = applyFilters(pool, params);
  const sorted = applySort(filtered, params.sort);

  const total = sorted.length;
  const totalPages = total === 0 ? 1 : Math.ceil(total / params.pageSize);
  // Clamp page to valid range
  const page = Math.min(params.page, totalPages);
  const offset = (page - 1) * params.pageSize;
  const data = sorted.slice(offset, offset + params.pageSize);

  return {
    data,
    meta: { total, page, pageSize: params.pageSize, totalPages },
  };
}
