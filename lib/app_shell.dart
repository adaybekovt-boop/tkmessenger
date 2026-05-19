// Port of the tab-bar / main-screen plumbing in `src/App.jsx`.
//
// The React app keeps the four main sections (Чаты / Drop / Игры / Ещё) as
// sibling render branches gated on a `tab` useState, with a fixed bottom
// `TabButton` row. That structure maps cleanly onto Flutter's IndexedStack +
// NavigationBar: each tab is always mounted (so state like chat scroll
// position survives switching) and the selected index just controls which
// child is visible.
//
// The `PeerStatusPill` is rendered inside each tab page's AppBar `actions`
// rather than as a screen-level overlay — anchoring it to the AppBar avoids
// overlapping (and stealing taps from) other AppBar actions like the
// "add contact" button on the Chats tab. Call overlay sits on top of the
// IndexedStack; the in-app update banner is triggered post-mount via
// `ref.listen(updateCheckProvider, …)` and shown as a modal dialog when
// the GitHub Releases probe surfaces a newer build.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/haptics.dart';
import 'core/update_checker.dart';
import 'pages/chats_page.dart';
import 'pages/drop_page.dart';
import 'pages/games_page.dart';
import 'pages/settings_page.dart';
import 'state/calls_provider.dart';
import 'state/messaging_notifier.dart';
import 'state/update_provider.dart';
import 'ui/calls/call_overlay_mount.dart';
import 'ui/primitives/orbs_tab_bar.dart';
import 'ui/update/update_dialog.dart';

/// Which tab is currently selected. Exposed as a provider so pages can read
/// or drive it (e.g. a "go to Chats" call-to-action from settings).
final activeTabProvider = StateProvider<AppTab>((ref) => AppTab.chats);

enum AppTab { chats, drop, games, settings }

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  static const double _desktopFrameMaxWidth = 520;

  /// "Show the update dialog at most once per AppShell mount." The
  /// FutureProvider state can re-fire (e.g. on hot reload during dev,
  /// or after invalidation from settings), and we don't want to stack
  /// dialogs on top of each other.
  bool _updateDialogShown = false;

  void _onUpdateAvailable(UpdateInfo info) {
    if (_updateDialogShown) return;
    _updateDialogShown = true;
    // Defer one frame so we're not pushing a route during the build
    // that triggered the listener — `showDialog` from inside a
    // `ref.listen` callback during the initial frame trips an assert
    // about modal routes during build otherwise.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showUpdateDialog(context, info);
    });
  }

  @override
  Widget build(BuildContext context) {
    final active = ref.watch(activeTabProvider);

    // Eagerly materialise the notifiers whose constructors bind themselves
    // to PeerJS events (messaging → connections registry, calls →
    // peer.onCall). Without this, Riverpod lazily builds each notifier on
    // first read, so a message arriving before the user opens a chat —
    // or a call dialing in while they're on the Chats tab — would land
    // in a black hole.
    //
    // `ref.listen` with a no-op handler subscribes the notifier (forcing
    // its constructor to run) without rebuilding AppShell on state
    // changes; `ref.watch` would rebuild the whole Scaffold on every
    // typing flip or call-state transition, which is wasteful and
    // defeats `callIsActiveProvider.select` downstream.
    ref.listen(messagingNotifierProvider, (_, __) {});
    ref.listen(callsNotifierProvider, (_, __) {});

    // In-app update check: kicks off a single GitHub Releases API call
    // the first time anything watches `updateCheckProvider`. The
    // listener reacts to both the initial resolve and any later
    // invalidation. `fireImmediately: true` covers the (common) case
    // where the future has already resolved by the time AppShell
    // remounts — without it we'd silently miss every cached update.
    ref.listen<AsyncValue<UpdateInfo?>>(
      updateCheckProvider,
      (_, next) {
        next.whenData((info) {
          if (info != null) _onUpdateAvailable(info);
        });
      },
      fireImmediately: true,
    );

    final shellBody = Stack(
      children: [
        Positioned.fill(
          child: IndexedStack(
            index: active.index,
            children: const [
              ChatsPage(),
              DropPage(),
              GamesPage(),
              SettingsPage(),
            ],
          ),
        ),
        const Positioned.fill(child: CallOverlayMount()),
      ],
    );
    final bottomBar = OrbsTabBar(
      activeIndex: active.index,
      onTap: (i) {
        // hapticTap mirrors the JS `onClick={() => hapticTap()}` that
        // every TabButton carried. The helper already self-throttles so
        // fast taps don't stutter.
        hapticTap();
        ref.read(activeTabProvider.notifier).state = AppTab.values[i];
      },
      tabs: const [
        OrbsTabSpec(
          icon: Icons.chat_bubble_outline,
          activeIcon: Icons.chat_bubble,
          label: 'Чаты',
        ),
        OrbsTabSpec(
          icon: Icons.send_outlined,
          activeIcon: Icons.send,
          label: 'Drop',
        ),
        OrbsTabSpec(
          icon: Icons.sports_esports_outlined,
          activeIcon: Icons.sports_esports,
          label: 'Игры',
        ),
        OrbsTabSpec(
          icon: Icons.menu_outlined,
          activeIcon: Icons.menu,
          label: 'Ещё',
        ),
      ],
    );

    final centerDesktop = _isDesktopHost(context);

    return Scaffold(
      // IndexedStack keeps every tab's subtree mounted so scroll positions,
      // text-field contents, and in-progress animations survive a switch —
      // the same behavior the React app gets "for free" since it renders
      // all branches inside one component tree.
      //
      // Layering, bottom to top:
      //   1. `IndexedStack` of tab pages — each page hosts its own
      //      `PeerStatusPill` inside its AppBar actions.
      //   2. `CallOverlayMount` — fills the whole screen when a call is
      //      active (scrim + controls), zero-size otherwise.
      body: centerDesktop
          ? Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: _desktopFrameMaxWidth,
                ),
                child: shellBody,
              ),
            )
          : shellBody,
      bottomNavigationBar: centerDesktop
          ? Center(
              heightFactor: 1,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: _desktopFrameMaxWidth,
                ),
                child: bottomBar,
              ),
            )
          : bottomBar,
    );
  }

  bool _isDesktopHost(BuildContext context) {
    if (kIsWeb) return false;
    if (MediaQuery.sizeOf(context).width <= 700) return false;
    return switch (defaultTargetPlatform) {
      TargetPlatform.macOS || TargetPlatform.windows || TargetPlatform.linux =>
        true,
      _ => false,
    };
  }
}
