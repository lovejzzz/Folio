import { strFromU8, strToU8 } from 'fflate';
import type { WordImageType } from './media';
import { escapeXml } from './xml';

/**
 * Pictures in a Word file, written by hand. The docx library can place a picture, at the cost of a good part
 * of its size in every export; a picture set in line with the text is one run of fixed XML, a file under
 * word/media and a relationship. So the document is built with a marker where each picture goes, and the
 * marker is swapped for the picture once the file is made.
 */

export interface PlacedPicture {
  /** What the course calls it by: one file is written for each, however often it is shown. */
  src: string;
  bytes: Uint8Array;
  type: WordImageType;
  /** Size on the page, in pixels at 96 to the inch. */
  width: number;
  height: number;
  /** What a reader who can't see it is told. */
  description: string;
}

const MARK = 'FOLIO-PICTURE-';
/** The text that holds a picture's place until the file is made. */
export const pictureMark = (n: number): string => `${MARK}${n}:`;

/** The run the marker sits in, whole: it is replaced by the picture's run. */
const MARKED_RUN = new RegExp(`<w:r\\b[^>]*>(?:(?!</w:r>)[\\s\\S])*?<w:t[^>]*>${MARK}(\\d+):</w:t></w:r>`, 'g');

/** Word measures a picture in English Metric Units: 9525 to the pixel. */
const EMU = 9525;
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

function drawing(picture: PlacedPicture, n: number, rel: string): string {
  const size = `cx="${picture.width * EMU}" cy="${picture.height * EMU}"`;
  const name = `Picture ${n + 1}`;
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent ${size}/><wp:docPr id="${1000 + n}" name="${name}" descr="${escapeXml(picture.description)}"/>` +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${1000 + n}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext ${size}/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
  );
}

/** Put each picture where its marker is: the file under word/media, its relationship, and the run that shows it. */
export function placePictures(parts: Record<string, Uint8Array>, pictures: readonly PlacedPicture[]): void {
  const document = parts['word/document.xml'];
  const rels = parts['word/_rels/document.xml.rels'];
  if (!pictures.length || !document || !rels) return;
  const files = new Map<string, string>();
  const added: string[] = [];
  for (const p of pictures) {
    if (files.has(p.src)) continue;
    const rel = `rIdPicture${files.size + 1}`;
    const target = `media/picture${files.size + 1}.${p.type}`;
    files.set(p.src, rel);
    parts[`word/${target}`] = p.bytes;
    added.push(`<Relationship Id="${rel}" Type="${IMAGE_REL}" Target="${target}"/>`);
  }
  parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(rels).replace('</Relationships>', `${added.join('')}</Relationships>`));
  parts['word/document.xml'] = strToU8(
    strFromU8(document).replace(MARKED_RUN, (run, index: string) => {
      const picture = pictures[Number(index)];
      return picture ? drawing(picture, Number(index), files.get(picture.src)!) : run;
    }),
  );
}
