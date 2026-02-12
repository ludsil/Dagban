'use client';

import type { ComponentProps } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { UserStack } from './UserStack';

interface GraphHudRightProps {
  userStackProps: ComponentProps<typeof UserStack>;
  settingsPanelProps: ComponentProps<typeof SettingsPanel>;
  showSettings?: boolean;
}

export function GraphHudRight({
  userStackProps,
  settingsPanelProps,
  showSettings = true,
}: GraphHudRightProps) {
  return (
    <div className="graph-hud-right">
      <UserStack {...userStackProps} />
      {showSettings && <SettingsPanel {...settingsPanelProps} />}
    </div>
  );
}
