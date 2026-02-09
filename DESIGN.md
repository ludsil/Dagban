# Dagban Design Decisions

## Layout
- Organic force-directed graph (sprawling, like react-force-graph examples)
- Multiple root nodes allowed (cards with no dependencies)
- Zoom-to-fit on initial load, then free pan/zoom

## Data Model
- Each graph is a "project"
- Users can have multiple projects
- **Cards**: title, description, category, assignee
- **Edges**: source, target, progress (0-100 "fuse")
- Categories are user-defined with custom colors

## Card States
- **Active**: full category color (all dependencies complete)
- **Blocked**: faded/dulled category color (dependencies incomplete)
- **Done**: grayed out (all outgoing edges at 100%)

## Visual
- FigJam-style post-it cards
- Edges show "fuse" progress as burning toward target
- Customizable theming planned (bg color, node colors, fonts)
- Dark/light mode eventually (not urgent)

## Storage
- Local-first (localStorage)
- Future: RDS database, S3 for assets
