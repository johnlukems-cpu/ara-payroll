/** A user-facing error identified by a translation key (see messages/*.json → errors.*). Framework-free. */
export class UserError extends Error {
  constructor(public key: string, public values?: Record<string, string | number>) {
    super(key);
  }
}
