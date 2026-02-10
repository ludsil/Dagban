import ProjectView from '@/components/ProjectView';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectView projectId={projectId} />;
}
