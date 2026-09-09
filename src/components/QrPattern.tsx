import { useMemo } from 'react'
import { generateQrGrid } from '../lib/qrPattern'

/**
 * Renders real QR content as a square of modules.
 *
 * `dim` is the drawn size of the code itself; the quiet zone (four modules of
 * background on every side, which the spec requires and scanners rely on) is
 * added outside it. The modules are laid out on a grid of equal fractions
 * rather than fixed pixel sizes, so a fractional module width rounds
 * consistently instead of leaving a seam down the middle.
 */
export default function QrPattern({ content, dim = 150 }: { content: string; dim?: number }) {
  const grid = useMemo(() => generateQrGrid(content), [content])
  const size = grid.length
  const quiet = (dim / size) * 4

  return (
    <div
      // Always dark-on-white. An inverted code is legal but not reliably read,
      // and a counter is the wrong place to discover which scanners cope.
      className="grid rounded-md bg-white"
      style={{
        width: dim + quiet * 2,
        height: dim + quiet * 2,
        padding: quiet,
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        gridTemplateRows: `repeat(${size}, 1fr)`,
      }}
      // Hidden from assistive tech: a scanner reads the modules, and the code
      // is already printed in full beside it as text.
      aria-hidden="true"
    >
      {grid.flatMap((row, r) =>
        row.map((filled, c) => (
          <span key={`${r}-${c}`} className={filled ? 'bg-navy-950' : 'bg-white'} />
        ))
      )}
    </div>
  )
}
