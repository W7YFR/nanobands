/* The name's flight between the landing's hero and the page header.
 *
 * When the landing gives way to the page, the hero is gone and the header's
 * name is back. To make it look like one name moving, measure where the name
 * was before the switch, where it is after, and play the move back from the
 * old place. A class component, because "before the switch" is exactly
 * getSnapshotBeforeUpdate: the last moment the old layout can be read.
 */

import { Component, type ReactNode, type RefObject } from "react";

const FLY_MS = 550;

interface Props {
  /** The landing is showing. */
  landing: boolean;
  hero: RefObject<HTMLElement | null>;
  name: RefObject<HTMLElement | null>;
  /** Fades in with the name's arrival in the header. */
  sub: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export class Flight extends Component<Props> {
  override getSnapshotBeforeUpdate(prev: Props): DOMRect | null {
    if (prev.landing === this.props.landing) return null;
    return (prev.landing ? this.props.hero : this.props.name).current?.getBoundingClientRect() ?? null;
  }

  override componentDidUpdate(_: Props, _s: unknown, from: DOMRect | null): void {
    const el = (this.props.landing ? this.props.hero : this.props.name).current;
    if (!from || !el || !from.width) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    el.animate(
      [{ transformOrigin: "0 0", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` },
       { transformOrigin: "0 0", transform: "none" }],
      { duration: FLY_MS, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    if (!this.props.landing) this.props.sub.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: FLY_MS });
  }

  override render(): ReactNode {
    return this.props.children;
  }
}
