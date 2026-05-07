// Port of src/games/blockblast/BlockBlast.jsx — Block Blast game screen.
//
// The React component is a thick UI layer around the pure engine: it owns
// drag state (pointer position, snapped target cell, validity), renders the
// grid, slot tray, floating drag preview, ghost cells, line-clear bursts,
// and level-up / combo banners. This file ports that structure into a
// `StatefulWidget`.
//
// Gesture model:
//   The JS code uses Pointer Events + setPointerCapture so the whole drag
//   lives on the slot tile itself. Flutter's equivalent here is a
//   `GestureDetector` on each slot using onPanStart/onPanUpdate/onPanEnd.
//   Pan gestures in Flutter already "capture" the pointer for the lifetime
//   of the gesture, so we don't need an explicit pointer-capture call.
//
// Rendering:
//   The grid is laid out via a sized `SizedBox` holding a stack of absolutely
//   positioned cell widgets (filled cells, ghost preview, bursts). The slot
//   tray is a `Row` of three equal-flex cells. The floating drag preview is
//   a top-level `Positioned.fill` overlay inside a `Stack` wrapping the whole
//   scaffold body.
//
// Behaviours NOT ported (see final report for rationale):
//   - No sounds play yet (sound.dart is a stub).
//   - Local-best persistence via localStorage is replaced with an in-memory
//     `_best` field. Wire up `shared_preferences` later for persistence.
//   - framer-motion's spring animations are approximated with plain
//     AnimatedScale / AnimatedOpacity where it matters (ghost pulse, banner
//     fade). Pixel-perfect spring parity isn't attempted.

import 'package:flutter/material.dart';

import '../../core/haptics.dart';
import '../../themes/orbits_tokens.dart';
import 'engine.dart';
import 'shapes.dart';
import 'sound.dart';

/// Turn one of the `"r g b"` strings from shapes.dart into a Flutter Color.
Color _parseRgb(String triple, {double opacity = 1}) {
  final parts = triple.split(' ');
  final r = int.parse(parts[0]);
  final g = int.parse(parts[1]);
  final b = int.parse(parts[2]);
  return Color.fromRGBO(r, g, b, opacity);
}

/// Width/height of a shape's bounding box, in cells. Mirrors the JS
/// `shapeBounds` helper used by the tray preview and drag overlay.
({int h, int w}) _shapeBounds(List<ShapeCell> shape) {
  var maxR = 0, maxC = 0;
  for (final cell in shape) {
    if (cell.row > maxR) maxR = cell.row;
    if (cell.col > maxC) maxC = cell.col;
  }
  return (h: maxR + 1, w: maxC + 1);
}

/// Live state of an in-progress drag. Ported from the JS `drag` object.
class _DragState {
  final int slotIndex;
  final List<ShapeCell> shape;
  final int color;
  double pointerX;
  double pointerY;
  int? targetRow;
  int? targetCol;
  bool overGrid;
  bool valid;

  _DragState({
    required this.slotIndex,
    required this.shape,
    required this.color,
    required this.pointerX,
    required this.pointerY,
    required this.targetRow,
    required this.targetCol,
    required this.overGrid,
    required this.valid,
  });
}

/// Transient overlay bookkeeping for line-clear radial flashes.
class _Burst {
  final String id;
  final List<({int r, int c, int color})> cells;
  const _Burst(this.id, this.cells);
}

class BlockBlastPage extends StatefulWidget {
  final VoidCallback? onExit;

  const BlockBlastPage({super.key, this.onExit});

  @override
  State<BlockBlastPage> createState() => _BlockBlastPageState();
}

class _BlockBlastPageState extends State<BlockBlastPage>
    with TickerProviderStateMixin {
  final BlockBlastEngine _engine = BlockBlastEngine();
  late EngineSnapshot _snap;
  int _best = 0;
  bool _sound = true;

  _DragState? _drag;
  final GlobalKey _gridKey = GlobalKey();

  // Short-lived UI state.
  String? _bannerLabel;
  String? _bannerSub;
  int? _levelUpLevel;
  final List<_Burst> _bursts = [];
  int _shakeKey = 0;

  @override
  void initState() {
    super.initState();
    _snap = _engine.snapshot();
  }

  void _start() {
    _engine.start();
    _engine.drainEvents(); // swallow the start event — sound is a stub
    sfx.start();
    hapticTap();
    setState(() {
      _snap = _engine.snapshot();
      _bannerLabel = null;
      _bannerSub = null;
      _levelUpLevel = null;
      _bursts.clear();
    });
  }

  /// Sync engine → UI, handle side-effect events. Called after each placement.
  void _commit() {
    final s = _engine.snapshot();
    final events = _engine.drainEvents();

    // Collect UI reactions first, then mutate state in one setState so the
    // frame is consistent — otherwise a clear + gameOver double-render would
    // flicker the overlay.
    _Burst? pendingBurst;
    ({String label, String sub})? pendingBanner;
    int? pendingLevel;

    for (final ev in events) {
      if (ev is PlaceEvent) {
        sfx.place();
        hapticTap();
      } else if (ev is ClearEvent) {
        final n = ev.lineCount;
        if (n >= 3) {
          sfx.clearBig();
        } else if (n == 2) {
          sfx.clear2();
        } else {
          sfx.clear1();
        }
        hapticTap();
        final burstId = DateTime.now().microsecondsSinceEpoch.toString();
        final cells = ev.cells.map((idx) {
          final rr = idx ~/ gridSize;
          final cc = idx % gridSize;
          return (r: rr, c: cc, color: ev.colors[idx] ?? 0);
        }).toList();
        pendingBurst = _Burst(burstId, cells);
        if (ev.combo >= 2 || n >= 2) {
          final label = n >= 2 ? (n >= 3 ? '$n LINES' : 'DOUBLE') : 'LINE';
          final sub = ev.combo >= 2 ? 'COMBO x${ev.combo}' : '';
          pendingBanner = (label: label, sub: sub);
          if (ev.combo >= 2) sfx.combo();
        }
      } else if (ev is LevelUpEvent) {
        sfx.levelUp();
        hapticTap();
        pendingLevel = ev.level;
      } else if (ev is GameOverEvent) {
        sfx.gameOver();
        hapticTap();
      }
    }

    setState(() {
      _snap = s;
      if (pendingBurst != null) _bursts.add(pendingBurst);
      if (pendingBanner != null) {
        _bannerLabel = pendingBanner.label;
        _bannerSub = pendingBanner.sub;
      }
      if (pendingLevel != null) _levelUpLevel = pendingLevel;
      if (s.status == GameStatus.over && s.score > _best) _best = s.score;
    });

    // Tear down the transient overlays on a delay, matching the JS timeouts.
    if (pendingBurst != null) {
      final id = pendingBurst.id;
      Future.delayed(const Duration(milliseconds: 650), () {
        if (!mounted) return;
        setState(() => _bursts.removeWhere((b) => b.id == id));
      });
    }
    if (pendingBanner != null) {
      Future.delayed(const Duration(milliseconds: 1100), () {
        if (!mounted) return;
        setState(() {
          _bannerLabel = null;
          _bannerSub = null;
        });
      });
    }
    if (pendingLevel != null) {
      Future.delayed(const Duration(milliseconds: 1400), () {
        if (!mounted) return;
        setState(() => _levelUpLevel = null);
      });
    }
  }

  /// Convert a global pointer position into a snapped (row, col) on the grid,
  /// plus "is the shape engaged with the grid" bool. Clamps so the whole
  /// shape stays in bounds whenever the pointer is over the board.
  ({int? targetRow, int? targetCol, bool overGrid, Rect? gridBox, double size})
      _computeTarget(double clientX, double clientY, List<ShapeCell> shape) {
    final ctx = _gridKey.currentContext;
    if (ctx == null) {
      return (
        targetRow: null,
        targetCol: null,
        overGrid: false,
        gridBox: null,
        size: 0
      );
    }
    final rb = ctx.findRenderObject() as RenderBox?;
    if (rb == null || !rb.hasSize) {
      return (
        targetRow: null,
        targetCol: null,
        overGrid: false,
        gridBox: null,
        size: 0
      );
    }
    final origin = rb.localToGlobal(Offset.zero);
    final box = origin & rb.size;
    final size = box.width / gridSize;

    // The React version offsets the floating piece above the finger on
    // touch so the player can see it. Do the same here — 72 logical pixels.
    const offsetY = -72.0;

    final bounds = _shapeBounds(shape);
    final refX = clientX;
    final refY = clientY + offsetY;
    final topLeftX = refX - (bounds.w * size) / 2;
    final topLeftY = refY - (bounds.h * size) / 2;
    final rawRow = ((topLeftY - box.top) / size).round();
    final rawCol = ((topLeftX - box.left) / size).round();

    final tol = size;
    final overGrid = refX >= box.left - tol &&
        refX <= box.right + tol &&
        refY >= box.top - tol &&
        refY <= box.bottom + tol;

    final maxRow = gridSize - bounds.h;
    final maxCol = gridSize - bounds.w;
    final targetRow = overGrid ? rawRow.clamp(0, maxRow) : rawRow;
    final targetCol = overGrid ? rawCol.clamp(0, maxCol) : rawCol;
    return (
      targetRow: targetRow,
      targetCol: targetCol,
      overGrid: overGrid,
      gridBox: box,
      size: size
    );
  }

  /// Active pointer id for the current drag — only one finger / mouse-
  /// button at a time. Lets us ignore stray events from a second finger
  /// or a hover pointer that happens during the drag.
  int? _activePointer;

  void _onPointerDown(int slotIndex, PointerDownEvent e) {
    if (_snap.status != GameStatus.playing) return;
    if (_activePointer != null) return; // already dragging
    final slot = _snap.slots[slotIndex];
    if (slot == null) return;
    _activePointer = e.pointer;
    hapticTap();
    sfx.pickUp();
    final t = _computeTarget(e.position.dx, e.position.dy, slot.shape);
    setState(() {
      _drag = _DragState(
        slotIndex: slotIndex,
        shape: slot.shape,
        color: slot.color,
        pointerX: e.position.dx,
        pointerY: e.position.dy,
        targetRow: t.targetRow,
        targetCol: t.targetCol,
        overGrid: t.overGrid,
        valid: false,
      );
    });
  }

  void _onPointerMove(PointerMoveEvent e) {
    final drag = _drag;
    if (drag == null) return;
    if (_activePointer != e.pointer) return;
    final t = _computeTarget(e.position.dx, e.position.dy, drag.shape);
    final valid = t.overGrid &&
        t.targetRow != null &&
        t.targetCol != null &&
        _engine.canPlace(drag.slotIndex, t.targetRow!, t.targetCol!);
    setState(() {
      drag.pointerX = e.position.dx;
      drag.pointerY = e.position.dy;
      drag.targetRow = t.targetRow;
      drag.targetCol = t.targetCol;
      drag.overGrid = t.overGrid;
      drag.valid = valid;
    });
  }

  void _onPointerUp(PointerUpEvent e) {
    final drag = _drag;
    if (drag == null) return;
    if (_activePointer != e.pointer) return;
    _activePointer = null;
    var placed = false;
    if (drag.valid && drag.targetRow != null && drag.targetCol != null) {
      placed = _engine.place(drag.slotIndex, drag.targetRow!, drag.targetCol!);
    }
    setState(() => _drag = null);
    if (placed) {
      _commit();
    } else {
      sfx.invalid();
      setState(() => _shakeKey++);
    }
  }

  void _onPointerCancel(PointerCancelEvent e) {
    if (_drag == null) return;
    if (_activePointer != e.pointer) return;
    _activePointer = null;
    sfx.invalid();
    setState(() {
      _drag = null;
      _shakeKey++;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isIdle = _snap.status == GameStatus.idle;
    final isOver = _snap.status == GameStatus.over;
    final tokens = OrbitsTokens.of(context);

    return Scaffold(
      // Inherit the active theme's canvas colour. Atmospheric themes
      // override `scaffoldBackgroundColor` to transparent so the petals
      // / orbs show through; on classic themes we get the solid bg.
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                _buildHeader(tokens),
                _buildStatsStrip(tokens),
                Expanded(
                  child: _buildGridArea(
                    tokens: tokens,
                    isIdle: isIdle,
                    isOver: isOver,
                  ),
                ),
                _buildSlotTray(tokens),
              ],
            ),
            if (_drag != null) _buildFloatingPiece(_drag!),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(OrbitsTokens tokens) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: tokens.border)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () {
              hapticTap();
              widget.onExit?.call();
            },
            icon: Icon(Icons.arrow_back, color: tokens.text),
            tooltip: 'Назад',
          ),
          Expanded(
            child: Center(
              child: Text(
                'Block Blast',
                style: TextStyle(
                  color: tokens.text,
                  fontFamily: tokens.fontHeading,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: () {
              hapticTap();
              setState(() {
                _sound = !_sound;
                setSoundEnabled(_sound);
              });
            },
            icon: Icon(
              _sound ? Icons.volume_up : Icons.volume_off,
              color: tokens.muted,
            ),
            tooltip: _sound ? 'Выключить звук' : 'Включить звук',
          ),
          IconButton(
            onPressed: _start,
            icon: Icon(Icons.refresh, color: tokens.muted),
            tooltip: 'Новая игра',
          ),
        ],
      ),
    );
  }

  Widget _buildStatsStrip(OrbitsTokens tokens) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: tokens.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _StatCell(
            tokens: tokens,
            label: 'SCORE',
            value: _snap.score.toString(),
            big: true,
          ),
          _StatCell(
            tokens: tokens,
            label: 'BEST',
            value: _best.toString(),
            color: tokens.accent,
          ),
          _StatCell(
            tokens: tokens,
            label: 'LEVEL',
            value: _snap.level.toString(),
            color: tokens.success,
          ),
          _StatCell(
            tokens: tokens,
            label: 'LINES',
            value: _snap.lines.toString(),
          ),
        ],
      ),
    );
  }

  Widget _buildGridArea({
    required OrbitsTokens tokens,
    required bool isIdle,
    required bool isOver,
  }) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Center(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final side = constraints.biggest.shortestSide;
            return SizedBox(
              width: side,
              height: side,
              child: Stack(
                children: [
                  _buildGrid(side, tokens),
                  ..._bursts.expand((b) => b.cells.map(
                        (cell) => _BurstCell(
                          key: ValueKey('b-${b.id}-${cell.r}-${cell.c}'),
                          r: cell.r,
                          c: cell.c,
                          color: cell.color,
                          cellSize: side / gridSize,
                        ),
                      )),
                  if (_levelUpLevel != null) _buildLevelUpBanner(tokens),
                  if (_bannerLabel != null) _buildComboBanner(tokens),
                  if (isIdle) _buildIdleOverlay(tokens),
                  if (isOver) _buildGameOverOverlay(tokens),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildGrid(double side, OrbitsTokens tokens) {
    final cellSize = side / gridSize;
    final drag = _drag;

    // Precompute ghost cells (only while dragging and over the grid).
    List<({int r, int c})>? ghost;
    if (drag != null &&
        drag.overGrid &&
        drag.targetRow != null &&
        drag.targetCol != null) {
      ghost = drag.shape
          .map((cell) =>
              (r: drag.targetRow! + cell.row, c: drag.targetCol! + cell.col))
          .toList();
    }

    return Container(
      key: _gridKey,
      width: side,
      height: side,
      decoration: BoxDecoration(
        // Soft tinted "board" — matches the surface card pattern used
        // elsewhere in the app, plus a hairline border.
        color: tokens.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: tokens.border),
      ),
      child: Stack(
        children: [
          // Grid lines — a simple CustomPaint.
          Positioned.fill(
            child: CustomPaint(
              painter: _GridLinesPainter(
                cellSize: cellSize,
                color: tokens.muted.withValues(alpha: 0.18),
              ),
            ),
          ),
          // Filled cells.
          for (var r = 0; r < gridSize; r++)
            for (var c = 0; c < gridSize; c++)
              if (_snap.grid[r][c] != null)
                Positioned(
                  left: c * cellSize,
                  top: r * cellSize,
                  width: cellSize,
                  height: cellSize,
                  child: _FilledCell(color: _snap.grid[r][c]!),
                ),
          // Ghost preview.
          if (ghost != null)
            for (final g in ghost)
              Positioned(
                left: g.c * cellSize,
                top: g.r * cellSize,
                width: cellSize,
                height: cellSize,
                child: _GhostCell(color: drag!.color, valid: drag.valid),
              ),
        ],
      ),
    );
  }

  Widget _buildLevelUpBanner(OrbitsTokens tokens) {
    return Positioned.fill(
      child: IgnorePointer(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'LEVEL UP',
                style: TextStyle(
                  color: tokens.muted,
                  fontFamily: tokens.fontMono,
                  letterSpacing: 4,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '$_levelUpLevel',
                style: TextStyle(
                  color: tokens.accent,
                  fontFamily: tokens.fontHeading,
                  fontSize: 42,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildComboBanner(OrbitsTokens tokens) {
    return Positioned.fill(
      child: IgnorePointer(
        child: Align(
          alignment: const Alignment(0, -0.35),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _bannerLabel!,
                style: TextStyle(
                  color: tokens.success,
                  fontFamily: tokens.fontHeading,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 2,
                ),
              ),
              if ((_bannerSub ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _bannerSub!,
                    style: TextStyle(
                      color: tokens.accent,
                      fontFamily: tokens.fontMono,
                      fontSize: 11,
                      letterSpacing: 4,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildIdleOverlay(OrbitsTokens tokens) {
    return Positioned.fill(
      child: Container(
        decoration: BoxDecoration(
          // Dark scrim regardless of theme — the overlay sits on top of
          // the playing field and needs to dim it visibly. Using
          // `tokens.bg` here was a mistake: on most themes it matched
          // the page background and the overlay vanished, hiding the
          // "Играть" button — that's why the slots felt unresponsive
          // (they're disabled until the game leaves `idle`).
          color: tokens.scrim,
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'BLOCK BLAST',
              style: TextStyle(
                color: Colors.white,
                fontFamily: tokens.fontHeading,
                fontWeight: FontWeight.w900,
                letterSpacing: 4,
                fontSize: 22,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Перетаскивай блоки, очищай ряды и столбцы',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 11,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            _BigButton(tokens: tokens, label: 'Играть', onPressed: _start),
          ],
        ),
      ),
    );
  }

  Widget _buildGameOverOverlay(OrbitsTokens tokens) {
    return Positioned.fill(
      child: Container(
        decoration: BoxDecoration(
          color: tokens.scrim,
          borderRadius: BorderRadius.circular(12),
        ),
        alignment: Alignment.center,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Игра окончена',
              style: TextStyle(
                color: tokens.danger,
                fontFamily: tokens.fontHeading,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${_snap.score} очков',
              style: TextStyle(
                color: Colors.white,
                fontFamily: tokens.fontMono,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Уровень ${_snap.level} · линий ${_snap.lines}',
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 10,
              ),
            ),
            const SizedBox(height: 12),
            _BigButton(tokens: tokens, label: 'Ещё раз', onPressed: _start),
          ],
        ),
      ),
    );
  }

  Widget _buildSlotTray(OrbitsTokens tokens) {
    // The shake key bumps on every invalid drop — use it as the
    // AnimatedSwitcher trigger by keying a child. For simplicity the
    // "shake" here is a quick horizontal wiggle via AnimatedContainer.
    final disabled = _snap.status != GameStatus.playing;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: tokens.border)),
      ),
      child: TweenAnimationBuilder<double>(
        key: ValueKey('tray-$_shakeKey'),
        tween: Tween(begin: -6, end: 0),
        duration: const Duration(milliseconds: 350),
        curve: Curves.elasticOut,
        builder: (context, dx, child) {
          return Transform.translate(
            offset: Offset(_shakeKey == 0 ? 0 : dx, 0),
            child: child,
          );
        },
        child: Row(
          children: [
            for (var i = 0; i < _snap.slots.length; i++)
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    left: i == 0 ? 0 : 4,
                    right: i == _snap.slots.length - 1 ? 0 : 4,
                  ),
                  child: _buildSlot(i, disabled, tokens),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSlot(int index, bool disabled, OrbitsTokens tokens) {
    final slot = _snap.slots[index];
    final dragging = _drag?.slotIndex == index;
    final isActive = slot != null && !disabled && !dragging;
    const slotHeight = 86.0;

    final body = Container(
      height: slotHeight,
      decoration: BoxDecoration(
        color: tokens.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: tokens.border),
      ),
      alignment: Alignment.center,
      child: slot == null
          ? const SizedBox.shrink()
          : Opacity(
              opacity: dragging ? 0.25 : 1,
              child: _ShapePreview(
                shape: slot.shape,
                color: slot.color,
                cellSize: 16,
              ),
            ),
    );

    if (!isActive) return body;

    // Use `Listener` (raw pointer events) instead of `GestureDetector.
    // onPan*`. On Flutter Web the gesture arena treats mouse drags
    // weirdly — there's a kTouchSlop minimum and the pan recogniser
    // sometimes loses the arena to ancestor scrollables. Listener
    // bypasses both: every PointerDown/Move/Up reaches us immediately
    // with no movement threshold, no arena resolution.
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) => _onPointerDown(index, e),
      onPointerMove: _onPointerMove,
      onPointerUp: _onPointerUp,
      onPointerCancel: _onPointerCancel,
      child: body,
    );
  }

  Widget _buildFloatingPiece(_DragState drag) {
    // Recompute geometry each build — the grid's global position depends on
    // layout which we can only read from the RenderBox, not the constructor.
    final t = _computeTarget(drag.pointerX, drag.pointerY, drag.shape);
    final bounds = _shapeBounds(drag.shape);
    final cellSize = t.size > 0 ? t.size : 40.0;

    double left, top;
    if (drag.overGrid &&
        t.gridBox != null &&
        drag.targetRow != null &&
        drag.targetCol != null) {
      left = t.gridBox!.left + drag.targetCol! * cellSize;
      top = t.gridBox!.top + drag.targetRow! * cellSize;
    } else {
      left = drag.pointerX - (bounds.w * cellSize) / 2;
      top = drag.pointerY - 72 - (bounds.h * cellSize) / 2;
    }

    return Positioned(
      left: left,
      top: top,
      child: IgnorePointer(
        child: _ShapePreview(
          shape: drag.shape,
          color: drag.color,
          cellSize: cellSize,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Leaf widgets
// ---------------------------------------------------------------------------

class _StatCell extends StatelessWidget {
  final OrbitsTokens tokens;
  final String label;
  final String value;
  final Color? color;
  final bool big;

  const _StatCell({
    required this.tokens,
    required this.label,
    required this.value,
    this.color,
    this.big = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontFamily: tokens.fontMono,
            color: tokens.muted,
            fontSize: 9,
            letterSpacing: 2,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontFamily: tokens.fontMono,
            color: color ?? tokens.text,
            fontWeight: FontWeight.bold,
            fontSize: big ? 16 : 13,
          ),
        ),
      ],
    );
  }
}

class _FilledCell extends StatelessWidget {
  final int color;
  const _FilledCell({required this.color});

  @override
  Widget build(BuildContext context) {
    final rgb = colors[color];
    final base = _parseRgb(rgb);
    final fade = _parseRgb(rgb, opacity: 0.7);
    return Padding(
      padding: const EdgeInsets.all(2),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(4),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [base, fade],
          ),
          border: Border.all(color: _parseRgb(rgb, opacity: 0.9)),
        ),
      ),
    );
  }
}

class _GhostCell extends StatelessWidget {
  final int color;
  final bool valid;
  const _GhostCell({required this.color, required this.valid});

  @override
  Widget build(BuildContext context) {
    final rgb = colors[color];
    final bg = valid
        ? _parseRgb(rgb, opacity: 0.35)
        : const Color(0x59FF5555); // theme-less fallback for invalid tint
    final ring = valid
        ? _parseRgb(rgb, opacity: 0.7)
        : const Color(0xD9FF5555);
    return Padding(
      padding: const EdgeInsets.all(2),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: ring, width: 2),
        ),
      ),
    );
  }
}

class _BurstCell extends StatefulWidget {
  final int r;
  final int c;
  final int color;
  final double cellSize;

  const _BurstCell({
    super.key,
    required this.r,
    required this.c,
    required this.color,
    required this.cellSize,
  });

  @override
  State<_BurstCell> createState() => _BurstCellState();
}

class _BurstCellState extends State<_BurstCell>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 550),
    )..forward();
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rgb = colors[widget.color];
    final base = _parseRgb(rgb);
    return Positioned(
      left: widget.c * widget.cellSize,
      top: widget.r * widget.cellSize,
      width: widget.cellSize,
      height: widget.cellSize,
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _ctl,
          builder: (context, _) {
            final t = _ctl.value;
            return Transform.scale(
              scale: 0.6 + t * 1.4,
              child: Opacity(
                opacity: 1 - t,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [base, base.withValues(alpha: 0)],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ShapePreview extends StatelessWidget {
  final List<ShapeCell> shape;
  final int color;
  final double cellSize;

  const _ShapePreview({
    required this.shape,
    required this.color,
    required this.cellSize,
  });

  @override
  Widget build(BuildContext context) {
    final bounds = _shapeBounds(shape);
    final filled = List.generate(
      bounds.h,
      (_) => List<bool>.filled(bounds.w, false),
    );
    for (final cell in shape) {
      filled[cell.row][cell.col] = true;
    }
    return SizedBox(
      width: cellSize * bounds.w,
      height: cellSize * bounds.h,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var r = 0; r < bounds.h; r++)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var c = 0; c < bounds.w; c++)
                  SizedBox(
                    width: cellSize,
                    height: cellSize,
                    child: filled[r][c]
                        ? _FilledCell(color: color)
                        : const SizedBox.shrink(),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _BigButton extends StatelessWidget {
  final OrbitsTokens tokens;
  final String label;
  final VoidCallback onPressed;
  const _BigButton({
    required this.tokens,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    // Pick the on-accent text colour by luminance — same trick the theme
    // factory uses, so labels stay legible on Sakura's pink and Matrix's
    // bright green alike.
    final fg = tokens.accent.computeLuminance() > 0.55
        ? Colors.black
        : Colors.white;
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: tokens.accent,
        foregroundColor: fg,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        shape: const StadiumBorder(),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          fontFamily: tokens.fontHeading,
        ),
      ),
    );
  }
}

class _GridLinesPainter extends CustomPainter {
  final double cellSize;
  final Color color;
  const _GridLinesPainter({required this.cellSize, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 1;
    for (var i = 1; i < gridSize; i++) {
      final x = i * cellSize;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), p);
      final y = i * cellSize;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), p);
    }
  }

  @override
  bool shouldRepaint(covariant _GridLinesPainter old) =>
      old.cellSize != cellSize || old.color != color;
}
