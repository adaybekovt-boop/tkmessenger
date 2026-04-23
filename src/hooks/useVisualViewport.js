// useVisualViewport — single source of truth for "where is the user's visible
// viewport right now" while the on-screen keyboard opens and closes.
//
// Exposes three CSS variables on <html> plus a data attribute:
//
//   --orb-vvh            visualViewport.height / 100 (use as `calc(var(--orb-vvh)*100)`)
//   --orb-vv-offset-top  visualViewport.offsetTop in px. On iOS Safari
//                        versions that scroll the visual viewport inside
//                        the layout viewport (rather than resizing layout)
//                        when the keyboard opens, this is the vertical
//                        offset we need to translate our shell back into
//                        the visible area.
//   --orb-kb             effective on-screen keyboard height in px:
//                        max(0, innerHeight - vv.height - vv.offsetTop).
//                        0 on browsers that honour `interactive-widget=
//                        resizes-content` (Chrome 108+, iOS Safari 16.4+).
//                        Exposed for anything that wants to react to the
//                        keyboard directly, but most layout needs are
//                        handled by --orb-vvh + --orb-vv-offset-top alone.
//
//   html[data-keyboard="1"]  present while the keyboard is open — CSS hooks
//                            use this to hide the tab nav so the chat
//                            composer sits flush above the keyboard.
//
// All JS state is consolidated here so React components never have to
// subscribe to visualViewport directly.

import { useEffect } from 'react';

function setVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

export function useVisualViewport() {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const root = document.documentElement;

    const update = () => {
      const layoutH = window.innerHeight || 0;
      const visualH = vv?.height || layoutH;
      const offsetTop = vv?.offsetTop || 0;
      // Positive on legacy browsers where layout viewport stays put while the
      // visual viewport shrinks. Zero on browsers that resize layout.
      const kb = Math.max(0, Math.round(layoutH - visualH - offsetTop));

      setVar('--orb-vvh', `${visualH * 0.01}px`);
      setVar('--orb-vv-offset-top', `${offsetTop}px`);
      setVar('--orb-kb', `${kb}px`);

      const open = kb > 0 || offsetTop > 0;
      if (open) root.dataset.keyboard = '1';
      else delete root.dataset.keyboard;
    };

    update();

    if (!vv) {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // Some Android builds fire `resize` on window but not on visualViewport
    // when the keyboard overlaps content — subscribing to both is cheap and
    // keeps the vars honest.
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
}
