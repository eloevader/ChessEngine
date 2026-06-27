// Build-time version constants. These get a fresh timestamp on every
// production build so the user can verify in DevTools that they are
// running the latest deployed code (look for the
// "♟ Chess Analyzer v..." console message on page load).

declare const __BUILD_DATE__: string;

export const APP_VERSION = '0.9.1-beta';
export const APP_NAME = 'Chess Analyzer (beta)';
export const BUILD_DATE =
  typeof __BUILD_DATE__ !== 'undefined'
    ? (__BUILD_DATE__ as string)
    : new Date().toISOString();
