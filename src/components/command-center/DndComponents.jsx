import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '../../lib/utils';

export function DroppableHour({ id, isCovered, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
    disabled: isCovered
  });

  return (
    // flex-1 + min-w-0 are essential: this is a flex child of the hour row, and
    // without them the block cards size to their intrinsic width and overflow the
    // overflow-hidden timeline container (clipped on the left in RTL).
    <div ref={setNodeRef} className={cn("relative transition-colors flex-1 min-w-0", isOver && "bg-primary/5")}>
      {children}
    </div>
  );
}

export function DraggableBlock({ id, data, isLocked, children, onShortTap }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: data,
    disabled: isLocked
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : 1, // Drag overlay handles the floating look
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      className={cn(
        "touch-none cursor-pointer outline-none w-full min-w-0",
        !isLocked && "active:cursor-grabbing",
      )}
      onClick={() => {
        // Only trigger short tap if not dragging
        if (!isDragging && onShortTap) {
          onShortTap();
        }
      }}
    >
      {children}
    </div>
  );
}

export function DraggableSidebarTask({ id, data, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: data,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.4 : 1,
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      className="touch-none cursor-grab active:cursor-grabbing outline-none"
    >
      {children}
    </div>
  );
}
