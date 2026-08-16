/**
 * Raised when a query names something this engine cannot evaluate.
 *
 * The alternative — the one this class replaces — is a `default:` arm that
 * substitutes a different operator, or a trailing `return true` that widens
 * the query to the whole dataset. Both answer confidently and wrongly, which
 * is worse than not answering: the user has no way to tell.
 *
 * `reason` is user-facing copy. It survives the worker boundary as the RPC's
 * `error` string (the hub replies with `err.message`), so it must name the
 * limit AND what the user can do instead — the same rule
 * {@link CapabilityVerdict} reason strings follow on the client side.
 */
export class UnsupportedQueryError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'UnsupportedQueryError';
    this.reason = reason;
  }
}
