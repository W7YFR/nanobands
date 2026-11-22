/* Shared controls on their own: a "?" whose text holds controls, and a
 * dialog whose action waits for a choice. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Confirm } from "@/ui/Confirm";
import { Help } from "@/ui/Help";

afterEach(cleanup);

describe("an interactive ?", () => {
  it("stays open for a click inside its text, and shuts on a click outside", () => {
    render(<Help interactive label="About it" text={<details><summary>More</summary>Inside</details>} />);
    const q = screen.getByRole("button", { name: "About it" }), box = q.parentElement!;
    fireEvent.click(q);
    expect(box).toHaveClass("shown");
    const summary = box.querySelector(".tip summary")!;
    fireEvent.pointerDown(summary);
    fireEvent.click(summary);
    expect(box).toHaveClass("shown");
    fireEvent.pointerDown(document.body);
    expect(box).not.toHaveClass("shown");
  });

  it("shuts on Escape", () => {
    render(<Help interactive label="About it" text="Text" />);
    const q = screen.getByRole("button", { name: "About it" });
    fireEvent.click(q);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(q.parentElement).not.toHaveClass("shown");
  });
});

describe("a dialog with its action disabled", () => {
  it("does not take the action until it is enabled", () => {
    const go = vi.fn();
    const { rerender } = render(<Confirm title="Sure?" action="Go" disabled onConfirm={go} onCancel={() => {}}>Text</Confirm>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(go).not.toHaveBeenCalled();
    rerender(<Confirm title="Sure?" action="Go" onConfirm={go} onCancel={() => {}}>Text</Confirm>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(go).toHaveBeenCalledOnce();
  });
});
