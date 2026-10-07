/**
 * What Folio's page needs of this package on its own thread: saving and opening a course file, naming a download,
 * zipping a few files. None of it needs the libraries that make Word and PowerPoint files, which stay with the
 * export worker: imported from the package's main entry, a backup of one course fetched 750 KB of them.
 */
export { writeFolio, readFolio, readFolioFile, courseMediaIds, FOLIO_FORMAT, FOLIO_VERSION, MAX_FOLIO_BYTES, MAX_MEDIA_BYTES, type FolioManifest, type FolioMedia } from './folioFile';
export { type MediaResolver, type ResolvedMedia } from './media';
export { zipFiles } from './bundle';
export { slugFilename } from './filenames';
export { MIME } from './mime';
