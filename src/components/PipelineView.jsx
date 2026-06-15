import { useState } from 'react';
import { STAGES } from '../constants';
import { S } from '../styles';
import { getCurrentStage } from '../utils';
import OrderCard from './OrderCard';

export default function PipelineView({ filtered, settings, onAdvance, onRevert, onDelete, onEdit, onView, onMoveToStage, selectionMode, selectedIds, onToggleSelect }) {
  const [dragOverCol, setDragOverCol] = useState(null);

  const handleDragOver = (e, colIdx) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverCol(colIdx); };
  const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null); };
  const handleDrop = (e, targetStageIdx) => {
    e.preventDefault(); setDragOverCol(null);
    const orderId = e.dataTransfer.getData("orderId");
    if (orderId && onMoveToStage) onMoveToStage(orderId, targetStageIdx);
  };

  const colStyle = (isOver) => ({
    borderRadius: 10, padding: 10, flex: "0 0 210px", minWidth: 0,
    border: "1px solid var(--border-subtle)",
    transition: "box-shadow 0.15s, border 0.15s",
    ...(isOver ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : {}),
  });

  return (
    <div className="pipeline-board" style={{ display: "flex", gap: 8, padding: 12, minHeight: "calc(100vh - 70px)", overflowX: "auto", alignItems: "flex-start" }}>
      {STAGES.map((stage, idx) => (
        <div
          key={stage.key}
          style={{ ...colStyle(dragOverCol === idx), background: stage.color + "12" }}
          onDragOver={e => handleDragOver(e, idx)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, idx)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${stage.color}40` }}>
            <span style={{ fontSize: 12 }}>{stage.icon}</span>
            <span style={{ ...S.mono, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: stage.color, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stage.label}
            </span>
            <span style={{ ...S.mono, fontSize: 9, background: stage.color + "20", color: stage.color, borderRadius: 8, padding: "1px 6px", flexShrink: 0 }}>
              {filtered.filter(o => getCurrentStage(o) === idx).length}
            </span>
          </div>
          {filtered
            .filter(o => getCurrentStage(o) === idx)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(o => (
              <OrderCard key={o.id} order={o} onAdvance={onAdvance} onRevert={onRevert} onDelete={onDelete}
                onEdit={onEdit} onView={onView} settings={settings}
                selectionMode={selectionMode} selected={selectedIds?.has(o.id)} onToggleSelect={onToggleSelect} />
            ))}
        </div>
      ))}
    </div>
  );
}
