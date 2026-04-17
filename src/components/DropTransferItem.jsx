// Single file transfer row — shows progress, completion, or error state.

import { motion } from 'framer-motion';
import { Check, AlertTriangle, File, Loader2 } from 'lucide-react';
import { platform } from '../core/platform.js';
import { cx, formatSize } from '../utils/common.js';

/**
 * @param {object} props
 * @param {string} props.fileName
 * @param {number} [props.fileSize]
 * @param {'transferring'|'done'|'error'} props.status
 * @param {number} [props.progress] — 0-100
 * @param {string} [props.savePath] — Tauri only, path where file was saved
 * @param {string} [props.error] — error message
 */
export default function DropTransferItem({
  fileName,
  fileSize,
  status = 'transferring',
  progress = 0,
  savePath,
  error,
}) {
  const showPath = savePath && platform.isTauri;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/40 px-4 py-3 ring-1 ring-[rgb(var(--orb-border-rgb))]"
    >
      {/* Icon */}
      <div
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          status === 'done' && 'bg-[rgb(var(--orb-success-rgb))]/15',
          status === 'error' && 'bg-[rgb(var(--orb-danger-rgb))]/15',
          status === 'transferring' && 'bg-[rgb(var(--orb-accent-rgb))]/15'
        )}
      >
        {status === 'transferring' && (
          <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--orb-accent-rgb))]" />
        )}
        {status === 'done' && (
          <Check className="h-4 w-4 text-[rgb(var(--orb-success-rgb))]" />
        )}
        {status === 'error' && (
          <AlertTriangle className="h-4 w-4 text-[rgb(var(--orb-danger-rgb))]" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <File className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--orb-muted-rgb))]" />
          <span className="truncate text-sm text-[rgb(var(--orb-text-rgb))]">{fileName}</span>
        </div>

        {status === 'transferring' && (
          <div className="mt-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--orb-border-rgb))]">
              <motion.div
                className="h-full rounded-full bg-[rgb(var(--orb-accent-rgb))]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-[rgb(var(--orb-muted-rgb))]">
              <span>{progress}%</span>
              {fileSize != null && <span>{formatSize(fileSize)}</span>}
            </div>
          </div>
        )}

        {status === 'done' && showPath && (
          <p className="mt-0.5 truncate text-[10px] text-[rgb(var(--orb-muted-rgb))]">{savePath}</p>
        )}

        {status === 'done' && fileSize != null && (
          <p className="mt-0.5 text-[10px] text-[rgb(var(--orb-success-rgb))]">
            {formatSize(fileSize)}
          </p>
        )}

        {status === 'error' && error && (
          <p className="mt-0.5 truncate text-[10px] text-[rgb(var(--orb-danger-rgb))]">{error}</p>
        )}
      </div>
    </motion.div>
  );
}
