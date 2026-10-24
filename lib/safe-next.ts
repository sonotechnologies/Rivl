/** Only same-site relative paths, so `next` can't be used as an open redirect. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/today";
}
