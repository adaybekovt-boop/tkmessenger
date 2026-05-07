// Chess game screen. Pass-and-play on one device — the board flips with the
// turn so the active player always sees their own pieces at the bottom.
//
// Interaction model: tap your piece to select it (legal target squares get
// dot/ring overlays), tap a legal target to move. Tap an empty square or
// your own piece to swap selection. Pawn promotion shows an inline picker
// before applying the move.

import 'package:flutter/material.dart';

import '../../core/haptics.dart';
import '../../themes/orbits_tokens.dart';
import 'engine.dart';

class ChessPage extends StatefulWidget {
  final VoidCallback? onExit;
  const ChessPage({super.key, this.onExit});

  @override
  State<ChessPage> createState() => _ChessPageState();
}

class _ChessPageState extends State<ChessPage> {
  final ChessEngine _engine = ChessEngine();
  int? _selected;
  List<Move> _legalForSelected = const [];
  // When set, the UI is showing a promotion picker for this pending move.
  // We hold the candidate moves (queen/rook/bishop/knight) so the user can
  // pick which piece to promote to before we apply it.
  List<Move>? _pendingPromotion;
  bool _flipped = false; // whose perspective to render

  void _select(int idx) {
    final piece = _engine.atIndex(idx);
    final selected = _selected;
    final pending = _pendingPromotion;

    // Promotion picker is open — every other tap is ignored until the user
    // either picks a piece or taps the same source square again to cancel.
    if (pending != null) return;

    if (selected != null) {
      // Are we tapping a legal target?
      final candidates =
          _legalForSelected.where((m) => m.to == idx).toList();
      if (candidates.isNotEmpty) {
        if (candidates.length > 1 && candidates.first.promotion != null) {
          hapticTap();
          setState(() => _pendingPromotion = candidates);
          return;
        }
        hapticTap();
        _engine.makeMove(candidates.first);
        setState(() {
          _selected = null;
          _legalForSelected = const [];
          // Flip board after each turn so it always faces the player to move.
          // Pass-and-play feel — the active player sees their pieces near them.
          _flipped = _engine.turn == PieceColor.black;
        });
        return;
      }
    }
    // Otherwise: select a friendly piece, or clear selection.
    if (piece != null && piece.color == _engine.turn) {
      hapticTap();
      setState(() {
        _selected = idx;
        _legalForSelected = _engine.legalMovesFrom(idx);
      });
    } else {
      setState(() {
        _selected = null;
        _legalForSelected = const [];
      });
    }
  }

  void _confirmPromotion(PieceType pt) {
    final pending = _pendingPromotion;
    if (pending == null) return;
    final move = pending.firstWhere((m) => m.promotion == pt);
    hapticTap();
    _engine.makeMove(move);
    setState(() {
      _pendingPromotion = null;
      _selected = null;
      _legalForSelected = const [];
      _flipped = _engine.turn == PieceColor.black;
    });
  }

  void _cancelPromotion() {
    setState(() => _pendingPromotion = null);
  }

  void _newGame() {
    hapticTap();
    setState(() {
      _engine.reset();
      _selected = null;
      _legalForSelected = const [];
      _pendingPromotion = null;
      _flipped = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Scaffold(
      backgroundColor: tokens.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(tokens),
            _buildStatusStrip(tokens),
            _buildCapturedRow(tokens, top: true),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: _buildBoard(tokens),
                  ),
                ),
              ),
            ),
            _buildCapturedRow(tokens, top: false),
            _buildHistoryStrip(tokens),
          ],
        ),
      ),
    );
  }

  // ── Header ──────────────────────────────────────────────────────────────

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
                'Шахматы',
                style: TextStyle(
                  fontFamily: tokens.fontHeading,
                  color: tokens.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: () {
              hapticTap();
              setState(() => _flipped = !_flipped);
            },
            icon: Icon(Icons.swap_vert, color: tokens.muted),
            tooltip: 'Перевернуть доску',
          ),
          IconButton(
            onPressed: _newGame,
            icon: Icon(Icons.refresh, color: tokens.muted),
            tooltip: 'Новая игра',
          ),
        ],
      ),
    );
  }

  // ── Status strip ────────────────────────────────────────────────────────

  Widget _buildStatusStrip(OrbitsTokens tokens) {
    String label;
    Color tone;
    if (_engine.isCheckmate) {
      final winner = _engine.turn == PieceColor.white
          ? 'чёрные'
          : 'белые'; // side to move has been mated → opponent won
      label = 'Мат · победили $winner';
      tone = tokens.success;
    } else if (_engine.isStalemate) {
      label = 'Пат · ничья';
      tone = tokens.muted;
    } else {
      final mover =
          _engine.turn == PieceColor.white ? 'Ход белых' : 'Ход чёрных';
      label = _engine.inCheck ? '$mover · шах' : mover;
      tone = _engine.inCheck ? tokens.danger : tokens.muted;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: tokens.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontFamily: tokens.fontMono,
              color: tone,
              fontSize: 12,
              letterSpacing: 1,
            ),
          ),
          Text(
            'ХОД ${_engine.fullmoveNumber.toString().padLeft(2, '0')}',
            style: TextStyle(
              fontFamily: tokens.fontMono,
              color: tokens.muted,
              fontSize: 10,
              letterSpacing: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  // ── Captured pieces row ─────────────────────────────────────────────────

  Widget _buildCapturedRow(OrbitsTokens tokens, {required bool top}) {
    // Each strip shows the captures of the player sitting on that side of
    // the board. Default board layout (`!_flipped`): white is at the bottom,
    // so the bottom strip = whiteCaptured (black men), top strip =
    // blackCaptured (white men). When the board flips, swap.
    final showWhiteCapturedPieces = top == _flipped;
    final pieces = showWhiteCapturedPieces
        ? _engine.whiteCaptured // pieces white captured (i.e. black men)
        : _engine.blackCaptured;
    if (pieces.isEmpty) {
      return const SizedBox(height: 24);
    }
    return Container(
      height: 24,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          for (final p in pieces)
            Padding(
              padding: const EdgeInsets.only(right: 2),
              child: Text(
                p.glyph,
                style: TextStyle(
                  fontSize: 16,
                  color: tokens.muted,
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ── Board ───────────────────────────────────────────────────────────────

  Widget _buildBoard(OrbitsTokens tokens) {
    final lastMove =
        _engine.history.isNotEmpty ? _engine.history.last.move : null;

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: tokens.border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Stack(
          children: [
            Column(
              children: [
                for (var visualRow = 0; visualRow < 8; visualRow++)
                  Expanded(
                    child: Row(
                      children: [
                        for (var visualCol = 0; visualCol < 8; visualCol++)
                          Expanded(
                            child: _buildSquare(
                              tokens: tokens,
                              visualRow: visualRow,
                              visualCol: visualCol,
                              lastMove: lastMove,
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
            if (_pendingPromotion != null)
              _buildPromotionOverlay(tokens, _pendingPromotion!),
          ],
        ),
      ),
    );
  }

  Widget _buildSquare({
    required OrbitsTokens tokens,
    required int visualRow,
    required int visualCol,
    required Move? lastMove,
  }) {
    // Map visual position → board index, accounting for board flip.
    final boardRow = _flipped ? 7 - visualRow : visualRow;
    final boardCol = _flipped ? 7 - visualCol : visualCol;
    final idx = sq(boardRow, boardCol);

    final isLight = (boardRow + boardCol) % 2 == 0;
    final piece = _engine.atIndex(idx);

    // Square colours come from theme tokens — keeps every theme readable.
    final lightSq = Color.lerp(tokens.surface, tokens.bg, 0.2)!;
    final darkSq = Color.lerp(tokens.surface, tokens.text, 0.18)!;
    var bg = isLight ? lightSq : darkSq;

    // Highlight: selected source.
    if (_selected == idx) {
      bg = Color.lerp(bg, tokens.accent, 0.45)!;
    }
    // Highlight: last move from/to.
    if (lastMove != null && (lastMove.from == idx || lastMove.to == idx)) {
      bg = Color.lerp(bg, tokens.accent, 0.18)!;
    }

    // Is this square a legal target for the selected piece?
    final isTarget = _legalForSelected.any((m) => m.to == idx);
    final isCapture = isTarget && piece != null;

    return GestureDetector(
      onTap: () => _select(idx),
      behavior: HitTestBehavior.opaque,
      child: Container(
        decoration: BoxDecoration(color: bg),
        child: Stack(
          children: [
            // Coordinate labels — only on the outer edges.
            if (visualCol == 0)
              Positioned(
                top: 2,
                left: 4,
                child: Text(
                  (8 - boardRow).toString(),
                  style: TextStyle(
                    fontFamily: tokens.fontMono,
                    color: tokens.muted,
                    fontSize: 9,
                  ),
                ),
              ),
            if (visualRow == 7)
              Positioned(
                bottom: 2,
                right: 4,
                child: Text(
                  String.fromCharCode('a'.codeUnitAt(0) + boardCol),
                  style: TextStyle(
                    fontFamily: tokens.fontMono,
                    color: tokens.muted,
                    fontSize: 9,
                  ),
                ),
              ),
            // Move marker.
            if (isTarget)
              Center(
                child: isCapture
                    ? _CaptureRing(tokens: tokens)
                    : _MoveDot(tokens: tokens),
              ),
            // Piece glyph.
            if (piece != null)
              Center(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Text(
                      piece.glyph,
                      style: TextStyle(
                        fontSize: 36,
                        // Slight contrast bump so glyphs sit cleanly on both
                        // light and dark squares.
                        color: piece.color == PieceColor.white
                            ? Colors.white
                            : Colors.black,
                        shadows: [
                          Shadow(
                            color: piece.color == PieceColor.white
                                ? Colors.black.withValues(alpha: 0.55)
                                : Colors.white.withValues(alpha: 0.4),
                            blurRadius: 0.5,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPromotionOverlay(
      OrbitsTokens tokens, List<Move> options) {
    final sideToMove = _engine.turn;
    return GestureDetector(
      onTap: _cancelPromotion,
      behavior: HitTestBehavior.opaque,
      child: Container(
        color: tokens.scrim,
        alignment: Alignment.center,
        child: Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: tokens.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: tokens.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Превращение',
                style: TextStyle(
                  fontFamily: tokens.fontMono,
                  color: tokens.muted,
                  fontSize: 10,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final pt in const [
                    PieceType.queen,
                    PieceType.rook,
                    PieceType.bishop,
                    PieceType.knight,
                  ])
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: GestureDetector(
                        onTap: () => _confirmPromotion(pt),
                        child: Container(
                          width: 52,
                          height: 52,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: tokens.bg,
                            border: Border.all(color: tokens.border),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            Piece(sideToMove, pt).glyph,
                            style: TextStyle(
                              fontSize: 28,
                              color: sideToMove == PieceColor.white
                                  ? Colors.white
                                  : Colors.black,
                              shadows: [
                                Shadow(
                                  color: sideToMove == PieceColor.white
                                      ? Colors.black.withValues(alpha: 0.55)
                                      : Colors.white.withValues(alpha: 0.4),
                                  blurRadius: 0.5,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── History strip ───────────────────────────────────────────────────────

  Widget _buildHistoryStrip(OrbitsTokens tokens) {
    final history = _engine.history;
    if (history.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: tokens.border)),
        ),
        alignment: Alignment.center,
        child: Text(
          'Тап по своей фигуре, затем по клетке.',
          style: TextStyle(
            fontFamily: tokens.fontMono,
            color: tokens.muted,
            fontSize: 11,
          ),
        ),
      );
    }
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: tokens.border)),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        reverse: true,
        itemCount: history.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          final entry = history[history.length - 1 - i];
          // Move number rendered for white plies; black plies share the
          // most-recent number.
          final num =
              ((history.length - 1 - i) ~/ 2 + 1).toString();
          final isWhitePly = (history.length - 1 - i) % 2 == 0;
          return Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: tokens.surface,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: tokens.border),
            ),
            alignment: Alignment.center,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isWhitePly) ...[
                  Text(
                    '$num.',
                    style: TextStyle(
                      fontFamily: tokens.fontMono,
                      color: tokens.muted,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(width: 4),
                ],
                Text(
                  entry.san,
                  style: TextStyle(
                    fontFamily: tokens.fontMono,
                    color: tokens.text,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MoveDot extends StatelessWidget {
  final OrbitsTokens tokens;
  const _MoveDot({required this.tokens});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: tokens.accent.withValues(alpha: 0.55),
      ),
    );
  }
}

class _CaptureRing extends StatelessWidget {
  final OrbitsTokens tokens;
  const _CaptureRing({required this.tokens});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = constraints.biggest.shortestSide * 0.85;
        return SizedBox(
          width: size,
          height: size,
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: tokens.danger.withValues(alpha: 0.7),
                width: 3,
              ),
            ),
          ),
        );
      },
    );
  }
}
