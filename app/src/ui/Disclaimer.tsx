/* The warning that a photo's reading is best effort. The page shows it at
 * the top while a photo is open.
 */

export function Disclaimer({ id }: { id?: string }): React.ReactElement {
  return (
    <p className="disclaimer" id={id}>
      <span className="line"><b>Check before you transmit.</b> Reading a photo is best effort, so confirm each result on your NanoVNA.</span>
      <span className="line"><b>Transmit at your own risk!</b> NanoBands and its author are not responsible for damages to your system.</span>
    </p>
  );
}
