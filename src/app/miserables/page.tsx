'use client';

import { useMemo } from 'react';
import DagbanGraph from '@/components/DagbanGraph';
import { convertMiserablesToDagban } from '@/lib/miserables-converter';
import miserablesData from '@/lib/miserables.json';

/**
 * Test page for comparing node spacing with vanilla force-graph
 * Loads the miserables.json dataset (Les Miserables character co-appearances)
 *
 * Compare with: https://github.com/vasturiano/force-graph/blob/master/example/load-json/index.html
 */
export default function MiserablesPage() {
  // Convert miserables data to DagbanGraph format
  const graph = useMemo(() => {
    return convertMiserablesToDagban(miserablesData);
  }, []);

  return (
    <div className="w-screen h-screen">
      <DagbanGraph
        data={graph}
        showSettingsProp={true}
      />
    </div>
  );
}
