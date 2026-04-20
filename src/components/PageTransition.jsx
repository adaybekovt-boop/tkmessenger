// Pass-through. The previous implementation animated each tab swap with
// AnimatePresence(mode="wait") + slide + blur(4px), which on mobile produced
// the "lamp flicker" effect — the old screen was held on for the duration
// of the exit, the GPU thrashed a blur layer on every frame, and pages with
// their own enter animations (Games cards, BlockBlast overlay) compounded
// with the parent fade. Native messenger apps swap tabs instantly; doing
// the same here is both snappier and visually quieter.
//
// Kept as a component (not removed) so callers don't need to change.
export function PageTransition({ children }) {
  return children;
}
