'use client';

/** Physical screen resolution for a single wall panel. */
export const SCREEN_W = 1920;
export const SCREEN_H = 1080;

/** Wall grid dimensions (columns × rows of screens). */
export const COLS = 16;
export const ROWS = 4;

/**
 * Snap grid size in pixels. Aligns cleanly with screen boundaries:
 * 1920 % 120 === 0 and 1080 % 120 === 0
 */
export const SNAP_GRID = 120;
