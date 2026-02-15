'use client';

import type { ComponentProps, ReactNode } from 'react';
import { ProjectHud } from './ProjectHud';

interface GraphHudLeftProps {
  projectHud?: ReactNode;
  projectHudProps: ComponentProps<typeof ProjectHud>;
}

export function GraphHudLeft({ projectHud, projectHudProps }: GraphHudLeftProps) {
  return (
    <div className="graph-hud-left">
      {projectHud || <ProjectHud {...projectHudProps} />}
    </div>
  );
}
