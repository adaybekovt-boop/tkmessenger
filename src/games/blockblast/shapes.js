// Block Blast shape library. Every entry is an array of [row, col] cell offsets
// normalized so that at least one cell sits at row 0 and at least one at col 0.
// Each rotation variant is listed as its own entry — the random picker treats
// them as independent pieces, matching the original game's feel.

export const SHAPES = [
  // 1x1
  [[0, 0]],

  // Straight bars (2..5 cells)
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],

  // 2x2 square
  [[0, 0], [0, 1], [1, 0], [1, 1]],

  // 3x3 square
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],

  // Small L (2x2, three cells) — all 4 rotations
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 1], [1, 0], [1, 1]],

  // Big L (3x3 corner, 5 cells) — all 4 rotations
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]],

  // L / J style (4 cells) — all rotations
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 0], [2, 0]],
  [[0, 0], [1, 0], [1, 1], [1, 2]],
  [[0, 1], [1, 1], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],

  // T tetromino — all rotations
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[0, 1], [1, 0], [1, 1], [2, 1]],
  [[0, 1], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 0]],

  // S / Z (4 cells)
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [1, 2]],
  [[0, 1], [1, 0], [1, 1], [2, 0]],
];

// Seven distinct block colours. Values are raw "r g b" triples so they can be
// injected into Tailwind's rgb(var(--...)) slots or used directly in styles.
// Picked from Tailwind's 500 scale for strong saturation on both light and
// dark themes.
export const COLORS = [
  '236 72 153',   // pink
  '59 130 246',   // blue
  '16 185 129',   // green
  '245 158 11',   // amber
  '168 85 247',   // purple
  '239 68 68',    // red
  '20 184 166',   // teal
];
