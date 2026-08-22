// Generates a deterministic grid of booleans from a seed string, used to render
// a stylized "QR verification" pattern without a network call or extra dependency.
export function generateQrGrid(seed: string, size = 9): boolean[][] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }

  const grid: boolean[][] = []
  let state = hash || 1
  const next = () => {
    // xorshift32
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967295
  }

  for (let r = 0; r < size; r++) {
    const row: boolean[] = []
    for (let c = 0; c < size; c++) {
      row.push(next() > 0.52)
    }
    grid.push(row)
  }

  // Force finder-pattern-like solid corners for QR authenticity
  const stampCorner = (r0: number, c0: number) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        grid[r0 + r][c0 + c] = r === 1 && c === 1 ? false : true
      }
    }
  }
  stampCorner(0, 0)
  stampCorner(0, size - 3)
  stampCorner(size - 3, 0)

  return grid
}
