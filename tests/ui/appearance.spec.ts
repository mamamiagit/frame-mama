import { expect, test } from "@playwright/test";

test("all six colorways work in both modes and survive restart", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const names = ["Grove", "Ocean", "Orchid", "Rose", "Ember", "Graphite"];
  for (const mode of ["Dark", "Light"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    const surfaces = new Set<string>();
    for (const name of names) {
      await page
        .getByRole("radio", { name: `${name} colorway`, exact: true })
        .check();
      await expect(page.locator("html")).toHaveAttribute(
        "data-colorway",
        name.toLowerCase(),
      );
      await expect(
        page.getByRole("radio", { name: `${name} colorway`, exact: true }),
      ).toBeChecked();
      surfaces.add(
        await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        ),
      );
    }
    expect(surfaces.size).toBe(6);
  }
  await page
    .getByRole("radio", { name: "Ocean colorway", exact: true })
    .check();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-colorway", "ocean");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("radio", { name: "Ocean colorway", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "Orchid colorway", exact: true }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-colorway", "orchid");
});

test("colorway picker fits desktop/mobile and invalid saved choices fall back safely", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("frame-colorway", "not-a-theme"),
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-colorway", "grove");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("radio", { name: "Ocean colorway", exact: true })
    .check();
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("radio")).toHaveCount(6);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: "test-results/colorway-settings.png" });
  expect(errors).toEqual([]);
});
