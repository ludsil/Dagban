/**
 * Avatar drawing utilities for consistent rendering across 2D canvas and 3D CSS2D
 */

/** Avatar configuration based on font size */
export interface AvatarConfig {
  size: number;      // Avatar diameter
  radius: number;    // Avatar radius (size / 2)
  gap: number;       // Gap between text and avatar
  padding: number;   // Horizontal padding
}

/** Get avatar configuration for a given font size */
export function getAvatarConfig(fontSize: number): AvatarConfig {
  const size = fontSize * 1.1;  // Slightly smaller than text height for visual balance
  return {
    size,
    radius: size / 2,
    gap: fontSize * 0.4,
    padding: fontSize * 0.25,
  };
}

/** Get initials from an assignee name */
export function getInitials(assignee: string): string {
  return assignee
    .split(' ')
    .map(part => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

/**
 * Draw avatar circle on 2D canvas
 * @param ctx Canvas 2D context
 * @param x Center X position
 * @param y Center Y position
 * @param radius Avatar radius
 * @param globalScale Current zoom scale
 */
// Matches dark theme --muted: oklch(0.269 0 0) ≈ #3b3b3b
const AVATAR_BG = '#3b3b3b';
// Matches dark theme --muted-foreground: oklch(0.708 0 0) ≈ #a8a8a8
const AVATAR_FG = '#a8a8a8';

export function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  _globalScale: number,
  options?: {
    fillStyle?: string;
  }
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = options?.fillStyle ?? AVATAR_BG;
  ctx.fill();
}

/**
 * Draw initials inside avatar circle
 * @param ctx Canvas 2D context
 * @param initials Initials text (1-2 chars)
 * @param x Center X position
 * @param y Center Y position
 * @param fontSize Font size to use
 */
export function drawAvatarInitials(
  ctx: CanvasRenderingContext2D,
  initials: string,
  x: number,
  y: number,
  fontSize: number
): void {
  ctx.save();
  ctx.fillStyle = AVATAR_FG;
  ctx.font = `500 ${fontSize * 0.55}px Sans-Serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, x, y);
  ctx.restore();
}

/**
 * Draw person placeholder icon inside avatar circle (properly centered)
 * @param ctx Canvas 2D context
 * @param x Center X position
 * @param y Center Y position
 * @param radius Avatar radius
 */
export function drawAvatarPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
): void {
  ctx.fillStyle = AVATAR_FG;

  // Scale factors for icon within circle
  const scale = radius * 0.7;

  // Head: small circle at top (centered vertically in upper portion)
  const headRadius = scale * 0.35;
  const headY = y - scale * 0.25;
  ctx.beginPath();
  ctx.arc(x, headY, headRadius, 0, 2 * Math.PI);
  ctx.fill();

  // Body: half ellipse below head (shoulders/torso shape)
  const bodyWidth = scale * 0.6;
  const bodyHeight = scale * 0.35;
  const bodyY = y + scale * 0.35;

  ctx.beginPath();
  ctx.ellipse(x, bodyY, bodyWidth, bodyHeight, 0, Math.PI, 0, true);
  ctx.fill();
}

/**
 * Complete avatar drawing for 2D canvas
 * @param ctx Canvas 2D context
 * @param assignee Assignee name or null for placeholder
 * @param x Center X position
 * @param y Center Y position
 * @param fontSize Base font size
 * @param globalScale Current zoom scale
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  assignee: string | null | undefined,
  x: number,
  y: number,
  fontSize: number,
  globalScale: number
): void {
  const config = getAvatarConfig(fontSize);

  // Draw circle background
  drawAvatarCircle(ctx, x, y, config.radius, globalScale);

  // Draw content (initials or placeholder)
  if (assignee) {
    const initials = getInitials(assignee);
    drawAvatarInitials(ctx, initials, x, y, fontSize);
  } else {
    drawAvatarPlaceholder(ctx, x, y, config.radius);
  }
}

/**
 * Generate CSS styles for avatar HTML element (for 3D CSS2DObject).
 * Matches shadcn Avatar/AvatarFallback styling (bg-muted, text-muted-foreground, rounded-full).
 */
export function getAvatarCSSStyles(size: number = 16): string {
  return `
    width: ${size}px;
    height: ${size}px;
    border-radius: 9999px;
    background: var(--color-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    line-height: 1;
  `.replace(/\s+/g, ' ').trim();
}

/**
 * Generate avatar HTML content (initials or placeholder SVG).
 * Matches shadcn AvatarFallback styling (text-muted-foreground, text-xs, centered).
 */
export function getAvatarHTMLContent(assignee: string | null | undefined, iconSize: number = 10): string {
  if (assignee) {
    const initials = getInitials(assignee);
    return `<span style="color: var(--color-muted-foreground); font-size: ${iconSize * 0.7}px; font-weight: 500; line-height: 1; display: flex; align-items: center; justify-content: center;">${initials}</span>`;
  }

  return `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted-foreground)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
}
