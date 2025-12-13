import React, { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Settings,
  X,
} from 'lucide-react';

export default function EnhancedResizableImageView({ 
  node, 
  updateAttributes, 
  editor, 
  selected 
}: ReactNodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [dragDirection, setDragDirection] = useState<'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's' | null>(null);
  
  const startX = useRef(0);
  const startY = useRef(0);
  const startWidth = useRef(0);
  const startHeight = useRef(0);
  const lastUpdateTime = useRef(0);

  // Current attributes with defaults
  const width = (node.attrs.width as string) || 'auto';
  const height = (node.attrs.height as string) || 'auto';
  const alignment = (node.attrs.alignment as string) || 'left';
  const borderWidth = (node.attrs.borderWidth as string) || '0';
  const borderColor = (node.attrs.borderColor as string) || '#000000';
  const borderRadius = (node.attrs.borderRadius as string) || '0';

  useEffect(() => {
    if (imgRef.current) imgRef.current.draggable = false;
  }, []);

  // Create stable event handlers
  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !imgRef.current || !dragDirection) return;
    
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    
    let newWidth = startWidth.current;
    let newHeight = startHeight.current;
    
    // Calculate new dimensions based on drag direction
    if (dragDirection.includes('e')) newWidth = Math.max(50, startWidth.current + dx);
    if (dragDirection.includes('w')) newWidth = Math.max(50, startWidth.current - dx);
    if (dragDirection.includes('s')) newHeight = Math.max(50, startHeight.current + dy);
    if (dragDirection.includes('n')) newHeight = Math.max(50, startHeight.current - dy);
    
    // Maintain aspect ratio for corner handles
    if (dragDirection.length === 2) {
      const aspectRatio = startWidth.current / startHeight.current;
      if (Math.abs(dx) > Math.abs(dy)) {
        newHeight = newWidth / aspectRatio;
      } else {
        newWidth = newHeight * aspectRatio;
      }
    }

    // Throttle updates to improve performance (max 60fps)
    const now = Date.now();
    if (now - lastUpdateTime.current > 16) {
      lastUpdateTime.current = now;
      try {
        updateAttributes({ 
          width: `${Math.round(newWidth)}px`, 
          height: `${Math.round(newHeight)}px` 
        });
      } catch (err) {
        // Ignore transient errors
      }
    }
  };

  const handleMouseUp = () => {
    if (!isResizing) return;
    
    // Clean up event listeners first
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Restore text selection
    document.body.style.userSelect = '';
    
    // Reset state
    setIsResizing(false);
    setDragDirection(null);
    
    try {
      editor?.chain?.().focus().run();
    } catch (err) {
      // Ignore focus errors
    }
  };

  useEffect(() => {
    // Clean up on unmount
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent, direction: typeof dragDirection) => {
    e.preventDefault();
    e.stopPropagation();
    if (!imgRef.current) return;

    // Set resize state
    setIsResizing(true);
    setDragDirection(direction);
    startX.current = e.clientX;
    startY.current = e.clientY;
    
    const rect = imgRef.current.getBoundingClientRect();
    startWidth.current = rect.width;
    startHeight.current = rect.height;

    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Prevent text selection
    document.body.style.userSelect = 'none';
  };

  const handleAlignment = (newAlignment: 'left' | 'center' | 'right') => {
    updateAttributes({ alignment: newAlignment });
  };

  const handleBorderChange = (property: string, value: string) => {
    updateAttributes({ [property]: value });
  };

  const imageStyle: React.CSSProperties = {
    width: width !== 'auto' ? width : undefined,
    height: height !== 'auto' ? height : undefined,
    maxWidth: '100%',
    display: 'block',
    border: borderWidth !== '0' ? `${borderWidth} solid ${borderColor}` : undefined,
    borderRadius: borderRadius !== '0' ? borderRadius : undefined,
  };

  const containerStyle: React.CSSProperties = {
    textAlign: alignment as 'left' | 'center' | 'right',
    position: 'relative',
    display: 'inline-block',
  };

  // Drag handle component
  const DragHandle = ({ 
    direction, 
    className, 
    style 
  }: { 
    direction: typeof dragDirection; 
    className: string;
    style: React.CSSProperties;
  }) => (
    <div
      className={`absolute bg-blue-500 border border-white shadow-md hover:bg-blue-600 transition-colors ${className}`}
      style={style}
      onMouseDown={(e) => handleMouseDown(e, direction)}
    />
  );

  return (
    <NodeViewWrapper className="resizable-image-node">
      <div ref={containerRef} style={containerStyle}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            ref={imgRef}
            src={node.attrs.src as string}
            alt={(node.attrs.alt as string) || ''}
            style={imageStyle}
          />
          
          {/* Drag handles - only show when selected */}
          {selected && (
            <>
              {/* Corner handles */}
              <DragHandle
                direction="nw"
                className="cursor-nw-resize"
                style={{ top: -4, left: -4, width: 8, height: 8, borderRadius: '50%' }}
              />
              <DragHandle
                direction="ne"
                className="cursor-ne-resize"
                style={{ top: -4, right: -4, width: 8, height: 8, borderRadius: '50%' }}
              />
              <DragHandle
                direction="sw"
                className="cursor-sw-resize"
                style={{ bottom: -4, left: -4, width: 8, height: 8, borderRadius: '50%' }}
              />
              <DragHandle
                direction="se"
                className="cursor-se-resize"
                style={{ bottom: -4, right: -4, width: 8, height: 8, borderRadius: '50%' }}
              />
              
              {/* Edge handles */}
              <DragHandle
                direction="n"
                className="cursor-n-resize"
                style={{ top: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%' }}
              />
              <DragHandle
                direction="s"
                className="cursor-s-resize"
                style={{ bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%' }}
              />
              <DragHandle
                direction="w"
                className="cursor-w-resize"
                style={{ top: '50%', left: -4, transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%' }}
              />
              <DragHandle
                direction="e"
                className="cursor-e-resize"
                style={{ top: '50%', right: -4, transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%' }}
              />

              {/* Controls button */}
              <Button
                size="sm"
                variant="secondary"
                className="absolute -top-10 left-0 h-8 px-2 text-xs"
                onClick={() => setShowControls(!showControls)}
              >
                <Settings className="h-3 w-3 mr-1" />
                Style
              </Button>
            </>
          )}
        </div>

        {/* Style controls panel */}
        {selected && showControls && (
          <div className="absolute top-full left-0 mt-2 p-3 bg-white border rounded-lg shadow-lg z-10 min-w-[280px]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Image Settings</h4>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowControls(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* Alignment controls */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-700 block mb-2">Alignment</label>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={alignment === 'left' ? 'default' : 'outline'}
                  onClick={() => handleAlignment('left')}
                  className="h-8 px-2"
                >
                  <AlignLeft className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant={alignment === 'center' ? 'default' : 'outline'}
                  onClick={() => handleAlignment('center')}
                  className="h-8 px-2"
                >
                  <AlignCenter className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant={alignment === 'right' ? 'default' : 'outline'}
                  onClick={() => handleAlignment('right')}
                  className="h-8 px-2"
                >
                  <AlignRight className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Border controls */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Border Width</label>
                <select
                  value={borderWidth}
                  onChange={(e) => handleBorderChange('borderWidth', e.target.value)}
                  className="w-full text-xs border rounded px-2 py-1"
                >
                  <option value="0">None</option>
                  <option value="1px">1px</option>
                  <option value="2px">2px</option>
                  <option value="3px">3px</option>
                  <option value="4px">4px</option>
                  <option value="5px">5px</option>
                </select>
              </div>

              {borderWidth !== '0' && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Border Color</label>
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => handleBorderChange('borderColor', e.target.value)}
                    className="w-full h-8 border rounded"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Border Radius</label>
                <select
                  value={borderRadius}
                  onChange={(e) => handleBorderChange('borderRadius', e.target.value)}
                  className="w-full text-xs border rounded px-2 py-1"
                >
                  <option value="0">None</option>
                  <option value="4px">Small (4px)</option>
                  <option value="8px">Medium (8px)</option>
                  <option value="12px">Large (12px)</option>
                  <option value="50%">Circle</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}