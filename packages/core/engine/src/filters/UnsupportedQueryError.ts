/**
 * Raised when a filter model names something the shared predicate cannot
 * evaluate.
 *
 * The alternative — the one this class replaces — is a `default:` arm that
 * substitutes a different operator, or a trailing `return true` that widens
 * the query to the whole dataset. Both answer confidently and wrongly, which
 * is worse than not answering: the user has no way to tell.
 *
 * `reason` is user-facing copy. On the server-side plane it survives the
 * worker boundary as the RPC's `error` string (the hub replies with
 * `err.message`); on the client it reaches the same tooltips
 * {@link CapabilityVerdict} reasons do. Either way it must name the limit AND
 * what the user can do instead.
 *
 * It lives here rather than in the query plane because the predicate does:
 * one implementation of "does this row match this filter model" means one
 * refusal type behind it, so `instanceof` holds whichever side raised it.
 */
export class UnsupportedQueryError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'UnsupportedQueryError';
    this.reason = reason;
  }
}
