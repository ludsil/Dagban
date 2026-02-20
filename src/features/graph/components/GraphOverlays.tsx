'use client';

import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react';
import type { User } from '@/lib/types';
import type { ConnectionModeState, EdgeContextMenuState, GraphNodeData, HoverTooltipState, ViewMode } from '../types';
import type { PendingBurnState, TraverserOverlay } from '../hooks/useTraverserSystem';
import { EdgeContextMenu } from './EdgeContextMenu';
import { UserAvatar } from './UserAvatar';

type EdgeStartPickerState = {
  edgeId: string;
  x: number;
  y: number;
} | null;

type DragConnectState = {
  active: boolean;
  sourceNode: GraphNodeData | null;
  targetNode: GraphNodeData | null;
  progress: number;
  startTime: number | null;
};

interface GraphOverlaysProps {
  viewMode: ViewMode;
  traverserOverlays: TraverserOverlay[];
  draggingTraverserId: string | null;
  onTraverserOverlayPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, traverserId: string) => void;
  draggingUserId: string | null;
  draggingUserGhost: { x: number; y: number } | null;
  draggingUser: User | null;
  pendingBurn: PendingBurnState;
  pendingBurnAnchor: { x: number; y: number } | null;
  onConfirmPendingBurn: () => void;
  onCancelPendingBurn: () => void;
  edgeContextMenu: EdgeContextMenuState;
  edgeContextMenuTraverserId: string | null;
  onCloseEdgeContextMenu: () => void;
  onEdgeAssign: (edgeId: string, anchor: { x: number; y: number }) => void;
  onEdgeDetach: (traverserId: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  edgeStartPicker: EdgeStartPickerState;
  users: User[];
  onEdgeStartPickUser: (userId: string) => void;
  onAddUser: () => void;
  hoverTooltip: HoverTooltipState;
  connectionMode: ConnectionModeState;
  onCancelConnectionMode: () => void;
  dragConnect: DragConnectState;
}

export function GraphOverlays({
  viewMode,
  traverserOverlays,
  draggingTraverserId,
  onTraverserOverlayPointerDown,
  draggingUserId,
  draggingUserGhost,
  draggingUser,
  pendingBurn,
  pendingBurnAnchor,
  onConfirmPendingBurn,
  onCancelPendingBurn,
  edgeContextMenu,
  edgeContextMenuTraverserId,
  onCloseEdgeContextMenu,
  onEdgeAssign,
  onEdgeDetach,
  onEdgeDelete,
  edgeStartPicker,
  users,
  onEdgeStartPickUser,
  onAddUser,
  hoverTooltip,
  connectionMode,
  onCancelConnectionMode,
  dragConnect,
}: GraphOverlaysProps) {
  return (
    <>
      {traverserOverlays.length > 0 && (
        <div className="traverser-overlay-layer">
          {traverserOverlays.map(traverser => (
            <button
              key={traverser.id}
              type="button"
              className={`traverser-overlay ${draggingTraverserId === traverser.id ? 'dragging' : ''} ${traverser.isRoot ? 'root' : ''}`}
              style={{ left: `${traverser.x}px`, top: `${traverser.y}px` }}
              onPointerDown={(event) => onTraverserOverlayPointerDown(event, traverser.id)}
              title={traverser.user?.name || 'Traverser'}
            >
              <UserAvatar user={traverser.user} size="xs" className="traverser-overlay-avatar" />
              {traverser.isRoot && traverser.tangentAngle !== undefined && (
                <span
                  className="traverser-root-arrow"
                  style={
                    {
                      '--root-arrow-angle': `${(traverser.tangentAngle * 180) / Math.PI}deg`,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {draggingUserId && draggingUserGhost && (
        <div
          className="dragging-user-ghost"
          style={{ left: `${draggingUserGhost.x}px`, top: `${draggingUserGhost.y}px` }}
        >
          <UserAvatar user={draggingUser} size="xs" className="traverser-overlay-avatar" />
        </div>
      )}

      {pendingBurn && pendingBurnAnchor && (
        <div
          className="burn-confirm"
          style={{ left: `${pendingBurnAnchor.x}px`, top: `${pendingBurnAnchor.y}px` }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="burn-confirm-title">Is the task done?</div>
          <div className="burn-confirm-actions">
            <button type="button" onClick={onConfirmPendingBurn}>Yes, burn</button>
            <button type="button" className="ghost" onClick={onCancelPendingBurn}>Not yet</button>
          </div>
          <span className="burn-confirm-hint">Press Enter to confirm</span>
        </div>
      )}

      <EdgeContextMenu
        state={edgeContextMenu}
        traverserId={edgeContextMenuTraverserId}
        onClose={onCloseEdgeContextMenu}
        onAssign={onEdgeAssign}
        onDetach={onEdgeDetach}
        onDelete={onEdgeDelete}
      />

      {edgeStartPicker && (
        <div
          className="edge-start-picker"
          style={{ left: `${edgeStartPicker.x}px`, top: `${edgeStartPicker.y}px` }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="edge-start-title">Start progress</div>
          <div className="edge-start-users">
            {users.length === 0 && (
              <span className="edge-start-empty">Add a user to begin.</span>
            )}
            {users.map(user => (
              <button
                key={user.id}
                type="button"
                className="edge-start-user"
                onClick={() => onEdgeStartPickUser(user.id)}
                title={user.name}
              >
                <UserAvatar user={user} size="sm" />
              </button>
            ))}
            <button
              type="button"
              className="edge-start-add"
              onClick={onAddUser}
              title="Add user"
            >
              +
            </button>
          </div>
        </div>
      )}

      {hoverTooltip.visible && hoverTooltip.x > 0 && (
        <div
          className="node-hover-tooltip"
          style={{
            left: `${hoverTooltip.x + 12}px`,
            top: `${hoverTooltip.y + 12}px`,
          }}
        >
          <span className="node-hover-label" style={{ color: hoverTooltip.color || 'inherit' }}>{hoverTooltip.title}</span>
          {hoverTooltip.assignee && (
            <UserAvatar name={hoverTooltip.assignee} size="xs" />
          )}
        </div>
      )}

      {connectionMode.active && connectionMode.sourceNode && (
        <div className="connection-mode-indicator">
          <div className="connection-mode-source">
            <div
              className="connection-mode-dot"
              style={{ backgroundColor: connectionMode.sourceNode.color }}
            />
            <span>{connectionMode.sourceNode.title}</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span className="connection-mode-hint">Click a node to connect</span>
          <button className="connection-mode-cancel" onClick={onCancelConnectionMode}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {dragConnect.active && dragConnect.sourceNode && dragConnect.targetNode && (
        <div className="drag-connect-indicator">
          <div className="drag-connect-progress-bar">
            <div
              className="drag-connect-progress-fill"
              style={{ width: `${dragConnect.progress * 100}%` }}
            />
          </div>
          <span className="drag-connect-text">
            Connecting: {dragConnect.sourceNode.title} → {dragConnect.targetNode.title}
          </span>
        </div>
      )}
    </>
  );
}
