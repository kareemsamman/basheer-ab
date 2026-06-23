// ---------------------------------------------------------------------------
// "Log out when the whole browser is closed" — without re-prompting per tab.
//
// The auth session lives in localStorage (shared across tabs, survives reload),
// so opening a new tab never asks for a fresh login. The trade-off is that
// localStorage also survives a full browser close, which we DON'T want. To get
// the desired behaviour we keep a "heartbeat": every open tab stamps the current
// time into localStorage on an interval (and on focus/visibility). On a fresh
// page load we check that stamp:
//   • fresh  -> at least one tab was alive moments ago (another open tab, or a
//               quick reload/restart) -> keep the session.
//   • stale  -> no tab kept the browser alive for STALE_MS -> the browser was
//               closed -> purge the stored session so the user must log in again.
// Closing one tab while others stay open keeps the heartbeat fresh, so it does
// NOT log out — exactly the requested behaviour.
// ---------------------------------------------------------------------------

// Explicit key so the guard purges exactly the token the client persists.
export const AUTH_STORAGE_KEY = 'basheer-ab-auth';

const HEARTBEAT_KEY = 'basheer-ab-heartbeat';
const HEARTBEAT_INTERVAL_MS = 10_000; // how often each open tab proves it's alive
const STALE_MS = 30_000;              // grace window for a quick browser restart

const stamp = () => {
  try {
    localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
  } catch {
    /* localStorage unavailable (e.g. private mode) — ignore */
  }
};

// Run ONCE, synchronously, BEFORE the Supabase client reads its session.
export function guardBrowserCloseLogout() {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY);
    const last = raw ? Number(raw) : 0;
    const browserWasClosed = !last || Date.now() - last > STALE_MS;
    if (browserWasClosed) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
  // Mark this tab as alive right away so sibling tabs opening now see us.
  stamp();
}

// Keep the heartbeat fresh for as long as any tab is open.
export function startHeartbeat() {
  if (typeof window === 'undefined') return;
  stamp();
  window.setInterval(stamp, HEARTBEAT_INTERVAL_MS);
  window.addEventListener('focus', stamp);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') stamp();
  });
}
