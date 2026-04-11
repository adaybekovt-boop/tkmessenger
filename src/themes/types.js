// Theme manifest contract — expressed as jsdoc so the rest of the codebase
// can typecheck against it via editor tooling without a TS migration.
//
// A manifest is the *declarative description* of a theme. It lists tokens,
// shape, typography, motion, and an optional lazy-loaded Background
// component. ThemeProvider applies everything mechanically — there is no
// theme-specific code outside of the manifest + Background + styles.css.

/**
 * @typedef {Object} ThemeTokens
 * CSS custom properties written to `<html>`. Values follow the same
 * `R G B` (space-separated triplet) convention as the existing --orb-*-rgb
 * variables, so existing `rgb(var(--orb-accent-rgb))` usage keeps working.
 * Keys are free-form strings; anything starting with `--` is written as-is.
 */

/**
 * @typedef {Object} ThemeShape
 * @property {string} [radiusButton]
 * @property {string} [radiusCard]
 * @property {string} [radiusModal]
 * @property {string} [shadowCard]
 * @property {string} [blurSurface]    // e.g. '20px'
 */

/**
 * @typedef {Object} ThemeTypography
 * @property {string} [fontHeading]
 * @property {string} [fontBody]
 * @property {string} [fontMono]
 * @property {string} [letterSpacingHeading]
 * @property {number} [lineHeightBody]
 */

/**
 * @typedef {Object} ThemeMotion
 * @property {number} [durationShort]   // seconds — framer-motion compatible
 * @property {number} [durationMedium]
 * @property {number} [durationLong]
 * @property {number[]} [ease]          // cubic-bezier control points
 * @property {'subtle' | 'freeze' | 'disable'} [reducedMotionFallback]
 */

/**
 * @typedef {Object} ThemeFeatures
 * Behavioural hints read by shared UI components. Components use these to
 * pick between style variants without knowing the active theme.
 *
 * @property {'hanko-stamp' | 'ring' | 'dot' | 'glow' | 'underline'} [activeTabOrnament]
 * @property {'rounded' | 'lantern' | 'bubble' | 'octagon' | 'paper' | 'framed-void'} [messageBubbleStyle]
 * @property {'fade-scale' | 'scroll-unroll' | 'book-flip' | 'frost-in' | 'prism-unfold' | 'wireframe-fill' | 'crack-expand' | 'smoke-exhale' | 'ripple-up' | 'glitch-decompress'} [modalEnter]
 * @property {boolean} [particlesEnabled]
 * @property {'subtle' | 'freeze' | 'disable'} [reducedMotionMode]
 */

/**
 * @typedef {Object} ThemePerformance
 * @property {number} [minFPS]               // degrade particles if real fps < this
 * @property {boolean} [degradeOnLowBattery]
 * @property {{desktop: number, mobile: number, lowEnd: number}} [maxParticles]
 */

/**
 * @typedef {Object} ThemeManifest
 * @property {string} id                  // stable unique identifier
 * @property {string} name                // human-readable title
 * @property {string} [subtitle]
 * @property {'classic' | 'atmospheric'} [family]  // UI grouping in Settings
 * @property {string} [preview]           // /themes/<id>/preview.webp
 * @property {'light' | 'dark'} [colorScheme]  // drives color-scheme CSS prop
 *
 * @property {Record<string, string>} tokens
 * @property {ThemeShape} [shape]
 * @property {ThemeTypography} [typography]
 * @property {ThemeMotion} [motion]
 * @property {ThemeFeatures} [features]
 * @property {ThemePerformance} [performance]
 *
 * Lazy-loaded Background component. Returning `null` (or omitting the field)
 * means the theme has no animated layer — the CSS gradient from tokens is
 * all there is. Classic themes (dark/light) skip it entirely.
 *
 * @property {(() => Promise<{default: (props: any) => any}>) | null} [background]
 */

export {};
