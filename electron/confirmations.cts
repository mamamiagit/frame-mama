import { randomUUID } from "node:crypto";
import type { ConfirmationRequest, ConfirmationSpec } from "./confirmation-types.cjs";

// The main process owns the operation and its prompt. The renderer can answer
// only the current opaque request; it cannot supply a prompt or a target path.
export class Confirmations {
  private pending: { request: ConfirmationRequest; finish: (accepted: boolean) => void } | null = null;
  constructor(private notify: (request: ConfirmationRequest | null) => void) {}
  current(): ConfirmationRequest | null {
    return this.pending ? { ...this.pending.request } : null;
  }
  ask(spec: ConfirmationSpec): Promise<boolean> {
    if (this.pending) throw new Error("Finish the open confirmation first.");
    return new Promise(resolve => {
      this.pending = { request: { ...spec, id: randomUUID() }, finish: resolve };
      this.notify(this.current());
    });
  }
  answer(id: unknown, accepted: unknown) {
    if (typeof id !== "string" || typeof accepted !== "boolean" || id !== this.pending?.request.id)
      throw new Error("This confirmation is invalid or has expired.");
    this.finish(accepted);
  }
  cancel() { this.finish(false); }
  private finish(accepted: boolean) {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    this.notify(null);
    pending.finish(accepted);
  }
}
