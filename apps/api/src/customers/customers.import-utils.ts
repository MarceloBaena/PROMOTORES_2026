import { TextDecoder } from 'node:util';

export interface ParsedCsvRow {
  rowNumber: number;
  values: Record<string, string>;
  cellsCount: number;
  extraValues: string[];
}

export interface ParsedCsvDocument {
  delimiter: ',' | ';' | '\t';
  originalHeaders: string[];
  normalizedHeaders: string[];
  rows: ParsedCsvRow[];
  skippedEmptyRows: number;
}

const SUPPORTED_CSV_DELIMITERS = [',', ';', '\t'] as const;
const utf8TextDecoder = new TextDecoder('utf-8', { fatal: true });
const windows1252TextDecoder = new TextDecoder('windows-1252');

const isAllowedControlCharacter = (code: number) =>
  code === 0x09 || code === 0x0a || code === 0x0d;

export const sanitizeStorageString = (value: string) => {
  let sanitized = '';

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code === 0x0000 || code === 0xfeff) {
      continue;
    }

    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = value.charCodeAt(index + 1);

      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        sanitized += value[index] + value[index + 1];
        index += 1;
      }

      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    if (
      (code >= 0x0001 && code <= 0x001f && !isAllowedControlCharacter(code)) ||
      (code >= 0x007f && code <= 0x009f)
    ) {
      continue;
    }

    sanitized += value[index];
  }

  return sanitized;
};

export const stripNullCharacters = (value: string) =>
  sanitizeStorageString(value);

export const deepSanitize = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return sanitizeStorageString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepSanitize(item));
  }

  if (value && typeof value === 'object') {
    const sanitizedEntries = Object.entries(value).map(([key, entry]) => [
      sanitizeStorageString(key),
      deepSanitize(entry),
    ]);

    return Object.fromEntries(sanitizedEntries);
  }

  return value;
};

const trimCell = (value: string) => stripNullCharacters(value).trim();

const swapByteOrder = (buffer: Buffer) => {
  const normalizedLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(normalizedLength);

  for (let index = 0; index < normalizedLength; index += 2) {
    swapped[index] = buffer[index + 1] ?? 0;
    swapped[index + 1] = buffer[index] ?? 0;
  }

  return swapped;
};

const detectUtf16Encoding = (buffer: Buffer) => {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'utf16le' as const;
    }

    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return 'utf16be' as const;
    }
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 256));

  if (sample.length < 4) {
    return null;
  }

  let evenNulls = 0;
  let oddNulls = 0;

  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) {
      continue;
    }

    if (index % 2 === 0) {
      evenNulls += 1;
    } else {
      oddNulls += 1;
    }
  }

  const pairs = Math.max(1, Math.floor(sample.length / 2));

  if (oddNulls / pairs >= 0.3) {
    return 'utf16le' as const;
  }

  if (evenNulls / pairs >= 0.3) {
    return 'utf16be' as const;
  }

  return null;
};

const decodeCsvBuffer = (buffer: Buffer) => {
  if (buffer.length === 0) {
    return '';
  }

  const utf16Encoding = detectUtf16Encoding(buffer);

  if (utf16Encoding === 'utf16le') {
    const startOffset =
      buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe ? 2 : 0;

    return stripNullCharacters(
      buffer.subarray(startOffset).toString('utf16le'),
    );
  }

  if (utf16Encoding === 'utf16be') {
    const startOffset =
      buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff ? 2 : 0;

    return stripNullCharacters(
      swapByteOrder(buffer.subarray(startOffset)).toString('utf16le'),
    );
  }

  try {
    return stripNullCharacters(utf8TextDecoder.decode(buffer));
  } catch {
    return stripNullCharacters(windows1252TextDecoder.decode(buffer));
  }
};

const parseCsvRecords = (raw: string, delimiter: ',' | ';' | '\t') => {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
        continue;
      }

      if (!inQuotes && trimCell(cell).length === 0) {
        cell = '';
        inQuotes = true;
        continue;
      }

      if (inQuotes) {
        inQuotes = false;
        continue;
      }

      cell += char;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(trimCell(cell));
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      row.push(trimCell(cell));
      cell = '';

      if (row.some((entry) => entry.length > 0)) {
        records.push(row);
      } else {
        records.push([]);
      }

      row = [];

      if (char === '\r' && next === '\n') {
        index += 1;
      }

      continue;
    }

    cell += char;
  }

  row.push(trimCell(cell));

  if (inQuotes) {
    throw new Error('CSV invalido: aspas abertas sem fechamento.');
  }

  if (row.some((entry) => entry.length > 0)) {
    records.push(row);
  } else if (records.length === 0) {
    records.push([]);
  }

  return records;
};

const readHeaderSample = (raw: string) => {
  let sample = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        sample += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      break;
    }

    sample += char;
  }

  return sample;
};

const detectCsvDelimiter = (
  raw: string,
  explicitDelimiter?: string,
): ',' | ';' | '\t' => {
  if (
    explicitDelimiter &&
    SUPPORTED_CSV_DELIMITERS.includes(explicitDelimiter as ',' | ';' | '\t')
  ) {
    return explicitDelimiter as ',' | ';' | '\t';
  }

  const sample = readHeaderSample(raw);
  const counts = SUPPORTED_CSV_DELIMITERS.map((delimiter) => ({
    delimiter,
    count: sample.split(delimiter).length - 1,
  }));
  const winner = counts.sort((left, right) => right.count - left.count)[0];

  return winner && winner.count > 0 ? winner.delimiter : ';';
};

const trimTrailingEmptyCells = (record: string[]) => {
  const trimmed = [...record];

  while (
    trimmed.length > 0 &&
    trimCell(trimmed[trimmed.length - 1] ?? '').length === 0
  ) {
    trimmed.pop();
  }

  return trimmed;
};

const buildNormalizedHeaders = (headers: string[]) => {
  const seen = new Map<string, number>();

  return headers.map((header, index) => {
    const baseHeader =
      normalizeImportHeader(trimCell(header)) || `column_${index + 1}`;
    const nextCount = (seen.get(baseHeader) ?? 0) + 1;
    seen.set(baseHeader, nextCount);

    return nextCount === 1 ? baseHeader : `${baseHeader}_${nextCount}`;
  });
};

export const normalizeImportHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export const parseCsvBuffer = (
  buffer: Buffer,
  explicitDelimiter?: string,
): ParsedCsvDocument => {
  const raw = decodeCsvBuffer(buffer).replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(raw, explicitDelimiter);
  const records = parseCsvRecords(raw, delimiter).map(trimTrailingEmptyCells);
  const nonEmptyRecords = records
    .map((record, index) => ({
      record,
      rowNumber: index + 1,
    }))
    .filter(({ record }) => record.some((entry) => entry.trim().length > 0));

  if (nonEmptyRecords.length === 0) {
    return {
      delimiter,
      originalHeaders: [],
      normalizedHeaders: [],
      rows: [],
      skippedEmptyRows: records.length,
    };
  }

  const headerRow = nonEmptyRecords[0];
  const originalHeaders = headerRow.record.map(trimCell);
  const normalizedHeaders = buildNormalizedHeaders(originalHeaders);
  const rows = records
    .map((record, recordIndex) => ({
      record,
      rowNumber: recordIndex + 1,
    }))
    .filter(({ rowNumber, record }) => {
      if (rowNumber === headerRow.rowNumber) {
        return false;
      }

      return record.some((entry) => entry.trim().length > 0);
    })
    .map(({ record, rowNumber }) => ({
      rowNumber,
      cellsCount: record.length,
      extraValues:
        record.length > normalizedHeaders.length
          ? record.slice(normalizedHeaders.length).map(trimCell).filter(Boolean)
          : [],
      values: normalizedHeaders.reduce<Record<string, string>>(
        (accumulator, header, headerIndex) => {
          accumulator[header] = trimCell(record[headerIndex] ?? '');
          return accumulator;
        },
        {},
      ),
    }));

  return {
    delimiter,
    originalHeaders,
    normalizedHeaders,
    rows,
    skippedEmptyRows: records.length - nonEmptyRecords.length,
  };
};

export const normalizeDigits = (value?: string | null) =>
  value ? value.replace(/\D/g, '') : '';

export const normalizeString = (value?: string | null) =>
  (value ? stripNullCharacters(value) : value)?.trim() ?? '';

export const normalizeUpper = (value?: string | null) =>
  normalizeString(value).toUpperCase();

export const normalizeOptional = (value?: string | null) => {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
};

export const normalizeOptionalUpper = (value?: string | null) => {
  const normalized = normalizeUpper(value);
  return normalized.length > 0 ? normalized : null;
};

export const parseBoolean = (value?: string | null) => {
  const normalized = normalizeString(value).toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'ativo', 'active'].includes(normalized);
};

export const parseNumber = (value?: string | null) => {
  const normalized = normalizeString(value).replace(',', '.');

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseInteger = (value?: string | null) => {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
};

export const parseMultiValueField = (value?: string | null) =>
  normalizeString(value)
    .split(/[;,|]/)
    .map((entry) => normalizeUpper(entry))
    .filter(Boolean);
