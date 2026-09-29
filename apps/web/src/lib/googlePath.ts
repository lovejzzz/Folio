/** Where Google sends the teacher back after signing in. It must match a redirect URI on the OAuth client exactly. */
export const GOOGLE_RETURN_PATH = '/to-google';

/** The OAuth client for Google sign-in and export; empty where none is configured (local builds, previews). */
export const googleClientId = (): string => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

/** Where Google sends the teacher back after signing in to Folio. */
export const SIGN_IN_PATH = '/sign-in';
