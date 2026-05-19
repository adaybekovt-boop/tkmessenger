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
// "add contact" button on the Chats tab. Call overlay + install / update
// banners still pending — they depend on providers that haven't landed yet.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/haptics.dart';
import 'pages/chats_page.dart';
import 'pages/drop_page.dart';
import 'pages/games_page.dart';
import 'pages/settings_page.dart';
import 'state/calls_provider.dart';
import 'state/messaging_notifier.dart';
import 'ui/calls/call_overlay_mount.dart';
import 'ui/primitives/orbs_tab_bar.dart';

/// Which tab is currently selected. Exposed as a provider so pages can read
/// or drive it (e.g. a "go to Chats" call-to-action from settings).
final activeTabProvider = StateProvider<AppTab>((ref) => AppTab.chats);

enum AppTab { chats, drop, games, settings }

class AppShell extends ConsumerWidget {
  const AppShell({super.key});

  static const double _desktopFrameMaxWidth = 520;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
