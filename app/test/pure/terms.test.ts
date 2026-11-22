/* The terms page and its version. An edit to the terms without a raise of
 * TERMS_VERSION would leave each agreement standing for terms nobody agreed
 * to. Each version's page has its hash here, so that edit fails. */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TERMS_VERSION } from "@/terms";

/** The SHA-256 of `app/public/terms.html` at each terms version. */
const HASHES: Record<number, string> = {
  1: "79127d776798d26861a0a7e5cab3c5ab5140577c5f89956a23198ea3888b53ac",
  2: "4d7726e6ed00afc21a6bb537128dd96a97962bcac6b5800b735730b983296da9",
};

describe("the terms", () => {
  it("raise TERMS_VERSION with each change to terms.html", () => {
    const page = readFileSync(fileURLToPath(new URL("../../public/terms.html", import.meta.url)));
    const hash = createHash("sha256").update(page).digest("hex");
    expect(hash, `terms.html changed: raise TERMS_VERSION in app/src/terms.ts and add ${TERMS_VERSION + 1}: "${hash}" here`).toBe(HASHES[TERMS_VERSION]);
  });
});
