/** A deliberately public, redacted error at the authenticated data boundary. */
export class PersistenceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}
