// Cloudflare Pages Functions entry for everything under /api; the logic lives in server/.
import { handle } from '../../server/src/api';
import type { Env } from '../../server/src/types';

export const onRequest = (context: { request: Request; env: Env }): Promise<Response> => handle(context.request, context.env);
