'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Header } from './Header';

interface GraphHudLeftProps {
  projectHeader?: ReactNode;
  headerProps: ComponentProps<typeof Header>;
}

export function GraphHudLeft({ projectHeader, headerProps }: GraphHudLeftProps) {
  return (
    <div className="graph-hud-left">
      {projectHeader || <Header {...headerProps} />}
    </div>
  );
}
