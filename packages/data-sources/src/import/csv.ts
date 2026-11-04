// RFC 4180 CSV parsing for declared imports (PRD §18). Cells stay strings;
// typing and validation happen against the Zod row schemas.

export interface CsvTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

export function parseCsv(input: string, options: { maxRows: number }): CsvTable {
  const text = input.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === "," || c === ";") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((v) => v.trim() !== "")) records.push(record);
      record = [];
      if (records.length > options.maxRows + 1)
        throw new CsvError(`more than ${options.maxRows} rows`);
    } else field += c;
  }
  if (quoted) throw new CsvError("unterminated quoted field");
  record.push(field);
  if (record.some((v) => v.trim() !== "")) records.push(record);
  const [header, ...body] = records;
  if (!header) throw new CsvError("empty file");
  if (body.length > options.maxRows) throw new CsvError(`more than ${options.maxRows} rows`);
  const headers = header.map((h) => h.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new CsvError("duplicate column names");
  return {
    headers,
    rows: body.map((cells) =>
      Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])),
    ),
  };
}
