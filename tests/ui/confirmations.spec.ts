import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = { current: null as any, answers: [] as boolean[], listeners: new Set<(value: any) => void>() };
    const notify = () => state.listeners.forEach(callback => callback(state.current));
    (window as any).showTestConfirmation = () => {
      state.current = {
        id: "a1e53759-529e-4590-9e8a-c77939d2be27",
        title: "Remove from library?",
        description: "Remove this video from your Frame library? Your original video file stays on your computer. Only its library entry and cached thumbnail are removed.",
        confirmLabel: "Remove from library", cancelLabel: "Keep video",
      };
      notify();
    };
    (window as any).confirmationAnswers = state.answers;
    (window as any).frame = {
      getAppInfo: async () => ({ version: "0.1.0", platform: "win32" }),
      organization: { localLaterCount: async () => 0 },
      youtube: { saved: async () => ({ items: [], total: 0 }) },
      confirmation: {
        current: async () => state.current,
        onChange: (callback: (value: any) => void) => { state.listeners.add(callback); return () => state.listeners.delete(callback); },
        answer: async (id: string, accepted: boolean) => {
          if (id !== state.current?.id) throw new Error("Expired");
          state.answers.push(accepted); state.current = null; notify();
        },
      },
    };
  });
});

test("confirmation uses the active colorway/mode and fits desktop and narrow screens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".video-card")).toHaveCount(8);
  for (const mode of ["dark", "light"]) {
    for (const colorway of ["grove", "ocean", "orchid", "rose", "ember", "graphite"]) {
      await page.evaluate(({ mode, colorway }) => {
        document.documentElement.dataset.theme = mode;
        document.documentElement.dataset.colorway = colorway;
        (window as any).showTestConfirmation();
      }, { mode, colorway });
      const dialog = page.getByRole("alertdialog", { name: "Remove from library?" });
      await expect(dialog).toBeVisible();
      const colors = await dialog.evaluate(element => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--surface)";
        probe.style.color = "var(--accent)";
        element.append(probe);
        const expected = getComputedStyle(probe);
        const values = { expectedBackground: expected.backgroundColor, expectedAccent: expected.color,
          background: getComputedStyle(element).backgroundColor,
          accent: getComputedStyle(element.querySelector(".confirmation-symbol")!).color };
        probe.style.backgroundColor = "var(--highlight)";
        const expectedButton = getComputedStyle(probe).backgroundColor;
        probe.remove(); return { ...values, expectedButton };
      });
      expect(colors.background).toBe(colors.expectedBackground);
      expect(colors.accent).toBe(colors.expectedAccent);
      await expect(dialog.getByRole("button", { name: "Remove from library", exact: true })).toHaveCSS("background-color", colors.expectedButton);
      for (const width of [1440, 900, 390]) {
        await page.setViewportSize({ width, height: 800 });
        const bounds = await dialog.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
  expect(await page.evaluate(() => (window as any).confirmationAnswers)).toEqual(Array(12).fill(false));
  expect(errors).toEqual([]);
});

test("confirmation defaults to keeping the video, traps focus and requires an explicit destructive choice", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Toggle sidebar" });
  await trigger.focus();
  await page.evaluate(() => (window as any).showTestConfirmation());
  const dialog = page.getByRole("alertdialog");
  const keep = dialog.getByRole("button", { name: "Keep video", exact: true });
  await expect(keep).toBeFocused();
  await page.keyboard.press("/");
  await expect(keep).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Remove from library", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Remove from library", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => (window as any).showTestConfirmation());
  await expect(keep).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await page.evaluate(() => (window as any).showTestConfirmation());
  await dialog.getByRole("button", { name: "Remove from library", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => (window as any).confirmationAnswers)).toEqual([false, false, true]);
});
