/** Fixed ballroom backdrop: gold light strips in from the wings, moving spotlight, floor, sparkle. */
export function StageBackdrop() {
  return (
    <div className="stage" aria-hidden>
      <div className="stage-spot" />
      <div className="stage-dust" />
      <div className="stage-floor" />
    </div>
  );
}
