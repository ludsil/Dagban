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
export function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  globalScale: number
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1 / globalScale;
  ctx.stroke();
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `bold ${fontSize * 0.55}px Sans-Serif`;
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

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
 * Generate CSS styles for avatar HTML element (for 3D CSS2DObject)
 * Returns inline style string
 */
export function getAvatarCSSStyles(size: number = 16): string {
  return `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  `.replace(/\s+/g, ' ').trim();
}

/**
 * Generate avatar HTML content (initials or placeholder SVG)
 */
export function getAvatarHTMLContent(assignee: string | null | undefined, iconSize: number = 10): string {
  if (assignee) {
    const initials = getInitials(assignee);
    return `<span style="color: rgba(255,255,255,0.85); font-size: ${iconSize}px; font-weight: bold;">${initials}</span>`;
  }

  // SVG placeholder icon - properly centered person silhouette
  return `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)">
    <circle cx="12" cy="8" r="4"/>
    <ellipse cx="12" cy="20" rx="7" ry="4"/>
  </svg>`;
}
