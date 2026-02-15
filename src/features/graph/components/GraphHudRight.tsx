'use client';

import type { ComponentProps } from 'react';
import { FilterHud } from './FilterHud';
import { UserHud } from './UserHud';

interface GraphHudRightProps {
  userHudProps: ComponentProps<typeof UserHud>;
  filterHudProps: ComponentProps<typeof FilterHud>;
  showSettings?: boolean;
}

export function GraphHudRight({
  userHudProps,
  filterHudProps,
  showSettings = true,
}: GraphHudRightProps) {
  return (
    <div className="graph-hud-right">
      <UserHud {...userHudProps} />
      {showSettings && <FilterHud {...filterHudProps} />}
    </div>
  );
}
