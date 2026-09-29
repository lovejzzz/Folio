import { LegalPage } from '../privacy/Privacy';
import { terms } from './text';

/** The terms of service and refund policy. Linked from the home page, Settings and the credit packs. */
export function Terms() {
  return <LegalPage title="Terms of Service" text={terms} />;
}
