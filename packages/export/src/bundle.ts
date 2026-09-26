import { zipSync, type Zippable } from 'fflate';

/** Formats that are zip archives already; deflating them again only costs time. */
const STORED = /\.(docx|pptx|xlsx|folio|zip|png|jpe?g)$/i;

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (taken.has(`${stem} (${i})${ext}`)) i += 1;
  return `${stem} (${i})${ext}`;
}

/** Zip several files into one archive. Repeated names get " (2)", " (3)" suffixes. */
export function zipFiles(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const entries: Zippable = {};
  const taken = new Set<string>();
  for (const file of files) {
    const name = uniqueName(file.name, taken);
    taken.add(name);
    entries[name] = [file.bytes, { level: STORED.test(name) ? 0 : 6 }];
  }
  return zipSync(entries);
}
