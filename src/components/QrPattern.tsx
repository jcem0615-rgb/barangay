import { generateQrGrid } from '../lib/qrPattern'

export default function QrPattern({ seed, size = 9, dim = 96, dark = false }: { seed: string; size?: number; dim?: number; dark?: boolean }) {
  const grid = generateQrGrid(seed, size)
  const cell = dim / size

  return (
    <div
      className={`grid rounded-md p-1.5 ${dark ? 'bg-navy-950' : 'bg-white'}`}
      style={{ width: dim + 12, height: dim + 12, gridTemplateColumns: `repeat(${size}, 1fr)` }}
    >
      {grid.flatMap((row, r) =>
        row.map((filled, c) => (
          <span
            key={`${r}-${c}`}
            style={{ width: cell, height: cell }}
            className={filled ? (dark ? 'bg-gold-400' : 'bg-navy-950') : 'bg-transparent'}
          />
        ))
      )}
    </div>
  )
}
