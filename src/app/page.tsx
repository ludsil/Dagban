'use client';

import DagbanGraph from '@/components/DagbanGraph';
import { sampleGraph } from '@/lib/sample-data';

export default function Home() {
  return (
    <div className="w-screen h-screen">
      <DagbanGraph data={sampleGraph} />
    </div>
  );
}
