// Port of src/games/blockblast/shapes.js — Block Blast shape library.
//
// Every entry is a list of [row, col] cell offsets, normalised so that at
// least one cell sits at row 0 and at least one at col 0. Each rotation is
// treated as its own piece (the random picker sees them as independent).

/// A single cell offset as a (row, col) record. Prefer this over List<int> so
/// call sites can't accidentally swap the two indices.
typedef ShapeCell = ({int row, int col});

ShapeCell _c(int row, int col) => (row: row, col: col);

final List<List<ShapeCell>> shapes = [
  // 1x1
  [_c(0, 0)],

  // Straight bars (2..5 cells)
  [_c(0, 0), _c(0, 1)],
  [_c(0, 0), _c(1, 0)],
  [_c(0, 0), _c(0, 1), _c(0, 2)],
  [_c(0, 0), _c(1, 0), _c(2, 0)],
  [_c(0, 0), _c(0, 1), _c(0, 2), _c(0, 3)],
  [_c(0, 0), _c(1, 0), _c(2, 0), _c(3, 0)],
  [_c(0, 0), _c(0, 1), _c(0, 2), _c(0, 3), _c(0, 4)],
  [_c(0, 0), _c(1, 0), _c(2, 0), _c(3, 0), _c(4, 0)],

  // 2x2 square
  [_c(0, 0), _c(0, 1), _c(1, 0), _c(1, 1)],

  // 3x3 square
  [
    _c(0, 0), _c(0, 1), _c(0, 2),
    _c(1, 0), _c(1, 1), _c(1, 2),
    _c(2, 0), _c(2, 1), _c(2, 2),
  ],

  // Small L (2x2, three cells) — all 4 rotations
  [_c(0, 0), _c(1, 0), _c(1, 1)],
  [_c(0, 0), _c(0, 1), _c(1, 0)],
  [_c(0, 0), _c(0, 1), _c(1, 1)],
  [_c(0, 1), _c(1, 0), _c(1, 1)],

  // Big L (3x3 corner, 5 cells) — all 4 rotations
  [_c(0, 0), _c(1, 0), _c(2, 0), _c(2, 1), _c(2, 2)],
  [_c(0, 0), _c(0, 1), _c(0, 2), _c(1, 0), _c(2, 0)],
  [_c(0, 0), _c(0, 1), _c(0, 2), _c(1, 2), _c(2, 2)],
  [_c(0, 2), _c(1, 2), _c(2, 0), _c(2, 1), _c(2, 2)],

  // L / J style (4 cells) — all rotations
  [_c(0, 0), _c(1, 0), _c(2, 0), _c(2, 1)],
  [_c(0, 0), _c(0, 1), _c(0, 2), _c(1, 0)],
  [_c(0, 0), _c(0, 1), _c(1, 1), _c(2, 1)],
  [_c(0, 2), _c(1, 0), _c(1, 1), _c(1, 2)],
  [_c(0, 0), _c(0, 1), _c(1, 0), _c(2, 0)],
  [_c(0, 0), _c(1, 0), _c(1, 1), _c(1, 2)],
  [_c(0, 1), _c(1, 1), _c(2, 0), _c(2, 1)],
  [_c(0, 0), _c(0, 1), _c(0, 2), _c(1, 2)],

  // T tetromino — all rotations
  [_c(0, 0), _c(0, 1), _c(0, 2), _c(1, 1)],
  [_c(0, 1), _c(1, 0), _c(1, 1), _c(2, 1)],
  [_c(0, 1), _c(1, 0), _c(1, 1), _c(1, 2)],
  [_c(0, 0), _c(1, 0), _c(1, 1), _c(2, 0)],

  // S / Z (4 cells)
  [_c(0, 1), _c(0, 2), _c(1, 0), _c(1, 1)],
  [_c(0, 0), _c(1, 0), _c(1, 1), _c(2, 1)],
  [_c(0, 0), _c(0, 1), _c(1, 1), _c(1, 2)],
  [_c(0, 1), _c(1, 0), _c(1, 1), _c(2, 0)],
];

/// Seven distinct block colours. Stored as "r g b" triples (0-255 each) to
/// match the JS format — `shapes_renderer.dart` will build `Color.fromARGB`.
const List<String> colors = [
  '236 72 153',   // pink
  '59 130 246',   // blue
  '16 185 129',   // green
  '245 158 11',   // amber
  '168 85 247',   // purple
  '239 68 68',    // red
  '20 184 166',   // teal
];
