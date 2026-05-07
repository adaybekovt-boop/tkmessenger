// Port of src/games/blockblast/engine.js — pure Block Blast engine.
//
// No Flutter imports, `dart:core` (plus `dart:math` for Random) only. The
// widget in `block_blast_page.dart` drives the engine via `place()` and reads
// state through `snapshot()`. Keeping the engine pure mirrors the JS version
// and makes it easy to unit-test or snapshot for a future daily-seed / multi
// player mode.
//
// The JS `grid` was a 2D array of `number | null`. In Dart we use
// `List<List<int?>>`. `null` means empty, any int is an index into `colors`
// from shapes.dart.

import 'dart:math' as math;

import 'shapes.dart';

const int gridSize = 8;
const int slotCount = 3;

const int _levelThreshold = 2000;
const int _pointsPerCell = 1;
const int _pointsPerClearedCell = 10;
const int _comboBonusPerStep = 50;
const double _multiLineBonus = 0.5; // each extra line adds 50% on top of base

final math.Random _rng = math.Random();

/// A shape sitting in one of the three slot trays, waiting to be dragged onto
/// the grid. `id` is a short random string used by the UI as a React-like key
/// so slot refill animations pick the right piece.
class Slot {
  final String id;
  final List<ShapeCell> shape;
  final int color;

  const Slot({required this.id, required this.shape, required this.color});
}

/// One-shot side-effect event produced by the engine. The UI drains these
/// after every placement and triggers sounds / haptics / burst overlays.
///
/// Fields are populated per `type`:
///   place     — cells (number of cells just placed)
///   clear     — lineCount, combo, cells (grid indices), colors (idx → color)
///   levelUp   — level
///   start     — (no extras)
///   gameOver  — (no extras)
sealed class EngineEvent {
  const EngineEvent();
}

class PlaceEvent extends EngineEvent {
  final int cells;
  const PlaceEvent(this.cells);
}

class ClearEvent extends EngineEvent {
  final int lineCount;
  final int combo;
  final List<int> cells;
  final Map<int, int> colors;
  const ClearEvent({
    required this.lineCount,
    required this.combo,
    required this.cells,
    required this.colors,
  });
}

class LevelUpEvent extends EngineEvent {
  final int level;
  const LevelUpEvent(this.level);
}

class StartEvent extends EngineEvent {
  const StartEvent();
}

class GameOverEvent extends EngineEvent {
  const GameOverEvent();
}

enum GameStatus { idle, playing, over }

/// Flash metadata from the last line-clear. `null` when no clear happened on
/// the latest placement — matches the JS `lastClear` semantics.
class LastClear {
  final int lineCount;
  final int combo;
  final int cellCount;
  const LastClear({
    required this.lineCount,
    required this.combo,
    required this.cellCount,
  });
}

/// Immutable frame of engine state exposed to the UI. The grid is deep-copied
/// inside `snapshot()` so later mutations don't leak into a rendered frame.
class EngineSnapshot {
  final List<List<int?>> grid;
  final List<Slot?> slots;
  final int score;
  final int level;
  final int combo;
  final int lines;
  final GameStatus status;
  final LastClear? lastClear;

  const EngineSnapshot({
    required this.grid,
    required this.slots,
    required this.score,
    required this.level,
    required this.combo,
    required this.lines,
    required this.status,
    required this.lastClear,
  });
}

List<List<int?>> _emptyGrid() =>
    List.generate(gridSize, (_) => List<int?>.filled(gridSize, null));

List<List<int?>> _cloneGrid(List<List<int?>> grid) =>
    grid.map((row) => List<int?>.from(row)).toList();

bool _canPlaceOn(List<List<int?>> grid, List<ShapeCell> shape, int r, int c) {
  for (final cell in shape) {
    final nr = r + cell.row;
    final nc = c + cell.col;
    if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) return false;
    if (grid[nr][nc] != null) return false;
  }
  return true;
}

/// Simulated placement: returns the resulting grid + line-clear count without
/// touching engine state. Used by `pickTripleForGrid` to pre-check candidate
/// slot triples.
class _PlaceResult {
  final List<List<int?>> grid;
  final int cleared;
  const _PlaceResult(this.grid, this.cleared);
}

_PlaceResult _placeAndClear(
  List<List<int?>> grid,
  List<ShapeCell> shape,
  int color,
  int r,
  int c,
) {
  final g = _cloneGrid(grid);
  for (final cell in shape) {
    g[r + cell.row][c + cell.col] = color;
  }
  final fullRows = <int>[];
  final fullCols = <int>[];
  for (var i = 0; i < gridSize; i++) {
    if (g[i].every((cell) => cell != null)) fullRows.add(i);
  }
  for (var j = 0; j < gridSize; j++) {
    var full = true;
    for (var i = 0; i < gridSize; i++) {
      if (g[i][j] == null) {
        full = false;
        break;
      }
    }
    if (full) fullCols.add(j);
  }
  for (final rr in fullRows) {
    for (var cc = 0; cc < gridSize; cc++) {
      g[rr][cc] = null;
    }
  }
  for (final cc in fullCols) {
    for (var rr = 0; rr < gridSize; rr++) {
      g[rr][cc] = null;
    }
  }
  return _PlaceResult(g, fullRows.length + fullCols.length);
}

/// Greedily simulates a permutation of slot shapes on the grid, each time
/// picking the placement that yields the most line clears. Returns the total
/// clears if every piece fits, else -1.
int _simulatePerm(
  List<List<int?>> grid,
  List<List<ShapeCell>> shapes,
  List<int> perm,
) {
  var g = grid;
  var total = 0;
  for (final idx in perm) {
    final shape = shapes[idx];
    List<List<int?>>? best;
    var bestCleared = -1;
    for (var r = 0; r < gridSize; r++) {
      for (var c = 0; c < gridSize; c++) {
        if (!_canPlaceOn(g, shape, r, c)) continue;
        final res = _placeAndClear(g, shape, 0, r, c);
        if (res.cleared > bestCleared) {
          bestCleared = res.cleared;
          best = res.grid;
          if (bestCleared > 0) break;
        }
      }
      if (bestCleared > 0) break;
    }
    if (best == null) return -1;
    g = best;
    total += bestCleared;
  }
  return total;
}

const List<List<int>> _perms = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2],
  [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

String _randomId() {
  // Mirrors JS `Math.random().toString(36).slice(2, 10)` — eight base-36
  // chars. Uniqueness is good enough for slot keys; not cryptographic.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  final buf = StringBuffer();
  for (var i = 0; i < 8; i++) {
    buf.write(alphabet[_rng.nextInt(alphabet.length)]);
  }
  return buf.toString();
}

List<Slot> _randomTriple() {
  return List.generate(slotCount, (_) {
    return Slot(
      id: _randomId(),
      shape: shapes[_rng.nextInt(shapes.length)],
      color: _rng.nextInt(colors.length),
    );
  });
}

/// Picks a triple of shapes that (a) can all be placed on the current grid in
/// some order, and (b) permits at least one line clear with smart play.
/// Falls back to "anything that fits together" and finally to pure random so
/// a truly stuck board still gets pieces (the UI will detect game-over).
List<Slot> _pickTripleForGrid(List<List<int?>> grid) {
  const attempts = 24;
  List<Slot>? bestTriple;
  var bestScore = -1;
  List<Slot>? fallbackTriple;

  for (var i = 0; i < attempts; i++) {
    final triple = _randomTriple();
    final tripleShapes = triple.map((t) => t.shape).toList();

    var clears = -1;
    for (final perm in _perms) {
      final c = _simulatePerm(grid, tripleShapes, perm);
      if (c > clears) clears = c;
      if (clears > 0) break;
    }
    if (clears < 0) continue;
    fallbackTriple ??= triple;
    final score = 1 + clears * 4;
    if (score > bestScore) {
      bestScore = score;
      bestTriple = triple;
      if (clears > 0) break;
    }
  }

  return bestTriple ?? fallbackTriple ?? _randomTriple();
}

/// The engine. Construct once per game session, call `start()` to begin, and
/// `place(slotIndex, r, c)` to commit a move. Use `canPlace()` during a drag
/// to decide whether the ghost overlay should light up green or red.
class BlockBlastEngine {
  List<List<int?>> _grid = _emptyGrid();
  List<Slot?> _slots = List<Slot?>.filled(slotCount, null);
  int _score = 0;
  int _level = 1;
  int _combo = 0;
  int _lines = 0;
  GameStatus _status = GameStatus.idle;
  LastClear? _lastClear;
  final List<EngineEvent> _events = [];

  void _refillIfEmpty() {
    if (_slots.every((s) => s == null)) {
      _slots = List<Slot?>.from(_pickTripleForGrid(_grid));
    }
  }

  bool _canPlaceAt(List<ShapeCell> shape, int r, int c) =>
      _canPlaceOn(_grid, shape, r, c);

  bool _canFitAnywhere(List<ShapeCell> shape) {
    for (var r = 0; r < gridSize; r++) {
      for (var c = 0; c < gridSize; c++) {
        if (_canPlaceAt(shape, r, c)) return true;
      }
    }
    return false;
  }

  bool _isGameOver() {
    for (final slot in _slots) {
      if (slot != null && _canFitAnywhere(slot.shape)) return false;
    }
    return true;
  }

  /// Reset the engine to a fresh playing state. Fires a `StartEvent`.
  void start() {
    _grid = _emptyGrid();
    _slots = List<Slot?>.from(_pickTripleForGrid(_grid));
    _score = 0;
    _level = 1;
    _combo = 0;
    _lines = 0;
    _status = GameStatus.playing;
    _lastClear = null;
    _events.clear();
    _events.add(const StartEvent());
  }

  /// Attempt to drop the shape from `slotIndex` with its top-left offset at
  /// (r, c). Returns true if placed. Handles scoring, line clearing, combo,
  /// level progression, slot refill, and game-over detection — same flow as
  /// the JS engine.
  bool place(int slotIndex, int r, int c) {
    if (_status != GameStatus.playing) return false;
    final slot = _slots[slotIndex];
    if (slot == null) return false;
    if (!_canPlaceAt(slot.shape, r, c)) return false;

    for (final cell in slot.shape) {
      _grid[r + cell.row][c + cell.col] = slot.color;
    }
    _slots = List<Slot?>.generate(
      _slots.length,
      (i) => i == slotIndex ? null : _slots[i],
    );
    _score += slot.shape.length * _pointsPerCell;

    // Collect full rows/columns first, clear atomically so a cross-clear
    // (row + column sharing a cell) counts both lines.
    final fullRows = <int>[];
    final fullCols = <int>[];
    for (var i = 0; i < gridSize; i++) {
      if (_grid[i].every((cell) => cell != null)) fullRows.add(i);
    }
    for (var j = 0; j < gridSize; j++) {
      var full = true;
      for (var i = 0; i < gridSize; i++) {
        if (_grid[i][j] == null) {
          full = false;
          break;
        }
      }
      if (full) fullCols.add(j);
    }

    final lineCount = fullRows.length + fullCols.length;
    _events.add(PlaceEvent(slot.shape.length));

    if (lineCount > 0) {
      final clearedIdx = <int>{};
      for (final r2 in fullRows) {
        for (var c2 = 0; c2 < gridSize; c2++) {
          clearedIdx.add(r2 * gridSize + c2);
        }
      }
      for (final c2 in fullCols) {
        for (var r2 = 0; r2 < gridSize; r2++) {
          clearedIdx.add(r2 * gridSize + c2);
        }
      }
      // Capture colours before we wipe — the burst animation needs them.
      final clearedColors = <int, int>{};
      for (final idx in clearedIdx) {
        final rr = idx ~/ gridSize;
        final cc = idx % gridSize;
        final color = _grid[rr][cc];
        if (color != null) clearedColors[idx] = color;
        _grid[rr][cc] = null;
      }

      _combo++;
      _lines += lineCount;

      final cellsCleared = clearedIdx.length;
      final basePoints = cellsCleared * _pointsPerClearedCell;
      final multi = 1 + _multiLineBonus * (lineCount - 1);
      final comboBonus =
          _combo > 1 ? _comboBonusPerStep * (_combo - 1) : 0;
      _score += (basePoints * multi).floor() + comboBonus;

      _lastClear = LastClear(
        lineCount: lineCount,
        combo: _combo,
        cellCount: cellsCleared,
      );
      _events.add(ClearEvent(
        lineCount: lineCount,
        combo: _combo,
        cells: clearedIdx.toList(),
        colors: clearedColors,
      ));
    } else {
      _combo = 0;
      _lastClear = null;
    }

    final newLevel = 1 + _score ~/ _levelThreshold;
    if (newLevel > _level) {
      _level = newLevel;
      _events.add(LevelUpEvent(newLevel));
    }

    _refillIfEmpty();

    if (_isGameOver()) {
      _status = GameStatus.over;
      _events.add(const GameOverEvent());
    }

    return true;
  }

  /// Exposed for the drag preview — answers "would it fit here" without
  /// mutating state, so the ghost cell can flip green/red in real time.
  bool canPlace(int slotIndex, int r, int c) {
    final slot = _slots[slotIndex];
    if (slot == null) return false;
    return _canPlaceAt(slot.shape, r, c);
  }

  /// Immutable view of current engine state. The grid is deep-copied so a
  /// stale render can't see a partially mutated board.
  EngineSnapshot snapshot() {
    return EngineSnapshot(
      grid: _cloneGrid(_grid),
      slots: List<Slot?>.from(_slots),
      score: _score,
      level: _level,
      combo: _combo,
      lines: _lines,
      status: _status,
      lastClear: _lastClear,
    );
  }

  /// Pop the accumulated side-effect events for the UI to react to (play
  /// sound, fire haptics, animate banner). The internal queue is emptied.
  List<EngineEvent> drainEvents() {
    final out = List<EngineEvent>.from(_events);
    _events.clear();
    return out;
  }
}
