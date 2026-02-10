'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Project, getProjects, createProject, deleteProject } from '@/lib/projects';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string) => void;
}

function CreateProjectModal({ isOpen, onClose, onCreate }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), description.trim() || undefined);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Project</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <label>Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My New Project"
              autoFocus
            />
          </div>
          <div className="modal-field">
            <label>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-btn cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn create" disabled={!name.trim()}>
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  projectName: string;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ isOpen, projectName, onClose, onConfirm }: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content-small" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Project</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="modal-warning">
          Are you sure you want to delete <strong>{projectName}</strong>? This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn delete" onClick={onConfirm}>
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectList() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(() => getProjects());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; project: Project | null }>({
    isOpen: false,
    project: null,
  });

  const handleCreateProject = useCallback((name: string, description?: string) => {
    const newProject = createProject(name, description);
    setProjects(prev => [...prev, newProject]);
  }, []);

  const handleDeleteProject = useCallback(() => {
    if (deleteModalState.project) {
      deleteProject(deleteModalState.project.id);
      setProjects(prev => prev.filter(p => p.id !== deleteModalState.project?.id));
      setDeleteModalState({ isOpen: false, project: null });
    }
  }, [deleteModalState.project]);

  const openProject = useCallback((projectId: string) => {
    router.push(`/project/${projectId}`);
  }, [router]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="project-list-container">
      <header className="project-list-header">
        <div className="project-list-header-left">
          <div className="header-logo-ball" />
          <h1>Dagban</h1>
        </div>
        <button
          className="create-project-btn"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Project
        </button>
      </header>

      <main className="project-list-main">
        {projects.length === 0 ? (
          <div className="project-list-empty">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3h7l2 3h9v12a2 2 0 01-2 2H5a2 2 0 01-2-2V3z" />
                <path d="M12 10v6M9 13h6" />
              </svg>
            </div>
            <h2>No projects yet</h2>
            <p>Create your first project to get started with Dagban.</p>
            <button
              className="create-project-btn large"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map(project => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => openProject(project.id)}
              >
                <div className="project-card-header">
                  <h3>{project.name}</h3>
                  <button
                    className="project-card-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteModalState({ isOpen: true, project });
                    }}
                    title="Delete project"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
                {project.description && (
                  <p className="project-card-description">{project.description}</p>
                )}
                <div className="project-card-meta">
                  <span>Updated {formatDate(project.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isCreateModalOpen && (
        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateProject}
        />
      )}

      <DeleteConfirmModal
        isOpen={deleteModalState.isOpen}
        projectName={deleteModalState.project?.name || ''}
        onClose={() => setDeleteModalState({ isOpen: false, project: null })}
        onConfirm={handleDeleteProject}
      />
    </div>
  );
}
