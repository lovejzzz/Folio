import { strFromU8, unzipSync } from 'fflate';

/** Unzip bytes and return a lookup of text parts. */
export function unzipText(bytes: Uint8Array): { names: string[]; text: (name: string) => string } {
  const files = unzipSync(bytes);
  return {
    names: Object.keys(files),
    text: (name) => {
      const file = files[name];
      if (!file) throw new Error(`missing ${name}`);
      return strFromU8(file);
    },
  };
}
