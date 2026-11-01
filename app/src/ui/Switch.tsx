/* One choice of a few, all in view: joined buttons, the one in force
 * pressed. One click changes it. cwt's switches look and work the same.
 */

export function Switch<T extends string>({ id, label, value, options, onChange }: {
  id: string;
  /** What the choice is about, for a screen reader. */
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(value: T): void;
}): React.ReactElement {
  return (
    <div className="modeswitch" role="group" aria-label={label} id={id}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
