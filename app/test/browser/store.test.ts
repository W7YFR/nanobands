/* The saved session's store, in a real IndexedDB. */

import { describe, expect, it } from "vitest";
import { openStore } from "@/store";

describe("openStore", () => {
  it("keeps a file and a snapshot, and forgets them on delete", async () => {
    const store = openStore(`test-${Math.random()}`);
    const blob = new Blob(["# MHz S RI R 50\n3 0.5 0\n"], { type: "text/plain" });
    await store.set("file", { blob, name: "a.s1p" });
    await store.set("session", { manual: [14.2], trace: { N: 2, v: new Float32Array([0.25, 0.5]) } });

    const f = await store.get<{ blob: Blob; name: string }>("file");
    expect(f?.name).toBe("a.s1p");
    expect(await f!.blob.text()).toContain("RI R 50");
    const s = await store.get<{ manual: number[]; trace: { v: Float32Array } }>("session");
    expect(s?.manual).toEqual([14.2]);
    expect(Array.from(s!.trace.v)).toEqual([0.25, 0.5]);

    await store.del("file");
    expect(await store.get("file")).toBeUndefined();
  });

  it("answers undefined for a key it never had", async () => {
    expect(await openStore(`test-${Math.random()}`).get("nothing")).toBeUndefined();
  });
});
