import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Confirmations } = require("../electron-dist/confirmations.cjs");
const spec = { title: "Remove from library?", description: "Original files are kept.", confirmLabel: "Remove", cancelLabel: "Keep video" };

describe("main-process confirmations", () => {
  it("keeps an operation pending until the matching request is explicitly accepted", async () => {
    const updates: unknown[] = [];
    const confirmations = new Confirmations((value: unknown) => updates.push(value));
    let finished = false;
    const result = confirmations.ask(spec).then((value: boolean) => { finished = true; return value; });
    const prompt = confirmations.current();
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(() => confirmations.answer("wrong-id", true)).toThrow();
    expect(() => confirmations.answer(prompt.id, "true")).toThrow();
    expect(confirmations.current().id).toBe(prompt.id);
    confirmations.answer(prompt.id, true);
    expect(await result).toBe(true);
    expect(confirmations.current()).toBeNull();
    expect(updates).toEqual([prompt, null]);
    expect(() => confirmations.answer(prompt.id, true)).toThrow();
  });
  it("cancels pending operations on navigation/close and rejects stale replies", async () => {
    const confirmations = new Confirmations(() => {});
    const first = confirmations.ask(spec);
    const previous = confirmations.current().id;
    confirmations.cancel();
    expect(await first).toBe(false);
    const second = confirmations.ask(spec);
    expect(confirmations.current().id).not.toBe(previous);
    expect(() => confirmations.answer(previous, true)).toThrow();
    confirmations.answer(confirmations.current().id, false);
    expect(await second).toBe(false);
  });
  it("rejects overlapping confirmations without replacing the pending operation", async () => {
    const confirmations = new Confirmations(() => {});
    const first = confirmations.ask(spec);
    const prompt = confirmations.current();
    expect(() => confirmations.ask(spec)).toThrow("Finish");
    expect(confirmations.current()).toEqual(prompt);
    confirmations.cancel();
    expect(await first).toBe(false);
  });
});
