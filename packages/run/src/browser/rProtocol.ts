/** Between Folio's page and the R runner page: plain data, checked again by the host before it is used. */
export type ToR = { t: 'boot'; base: string } | { t: 'fresh'; id: number } | { t: 'run'; id: number; line: string } | { t: 'need'; id: number; packages: string[] };
export type FromR = { t: 'hello' } | { t: 'ready' } | { t: 'failed'; message: string } | { t: 'done'; id: number; error: string | null };

/** R as the pipeline uses it: lines run one at a time, as a student runs them. */
export interface LineRunner {
  fresh(): Promise<void>;
  run(line: string): Promise<string | null>;
  need(packages: string[]): Promise<void>;
  close(): void;
}
