import React, { useState } from "react";

type NodeProps = {
  depth: number;
  maxDepth: number;
  childrenCount: number;
};

export const Node: React.FC<NodeProps> = ({
  depth,
  maxDepth,
  childrenCount,
}) => {
  if (depth > maxDepth) return null;

  return (
    <div
      style={{
        marginLeft: 16,
        padding: 12,
        border: "1px solid #d1d5db",
        borderRadius: 6,
        background: "#ffffff",
      }}
    >
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Depth: {depth}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {Array.from({ length: childrenCount }).map((_, index) => (
          <Node
            key={`${depth}-${index}`}
            depth={depth + 1}
            maxDepth={maxDepth}
            childrenCount={childrenCount}
          />
        ))}
      </div>
    </div>
  );
};
