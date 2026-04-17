import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const overlayVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
};

const dialogVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 20 },
  visible: { opacity: 1, scale: 1,    y: 0  },
  exit:    { opacity: 0, scale: 0.92, y: 20 },
};

// Only close when the gesture both starts and ends on the overlay itself,
// and the pointer barely moved. Prevents accidental close on touch-scroll
// or drag-select that happens to end on the backdrop.
const DRAG_CANCEL_PX = 10;

export function Modal({ isOpen, onClose, children }) {
  const pointerStartRef = useRef(null);

  const onPointerDown = (e) => {
    if (e.target !== e.currentTarget) {
      pointerStartRef.current = null;
      return;
    }
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;
    if (e.target !== e.currentTarget) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    if (dx > DRAG_CANCEL_PX || dy > DRAG_CANCEL_PX) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-[rgb(var(--orb-bg-rgb))] p-6 shadow-2xl ring-1 ring-white/[0.08]"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
