/**
 * Softens the seam between two sections of different colour: filled with the colour of the
 * section below, so it arcs up into the one above. The negative margin closes the sub-pixel gap
 * that shows as a hairline at some zoom levels.
 */
export function CurvedDivider({ fill }: { fill: string }) {
  return (
    <div aria-hidden="true" className="-mb-px w-full leading-[0]">
      <svg
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        className="block h-[56px] w-full md:h-[100px]"
      >
        <title>Section divider</title>
        <path d="M0,64 C480,0 960,0 1440,64 L1440,100 L0,100 Z" fill={fill} />
      </svg>
    </div>
  );
}
