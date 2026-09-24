import React from 'react';
import { Circle, Group, Label, Layer, Tag, Text } from 'react-konva';
import { useCollabStore } from '../../store/collab';

/** Ortak çalışmadaki diğer kullanıcıların canlı imleçleri. */
export function CursorLayer({ panelId, zoom }: { panelId: string; zoom: number }) {
  const participants = useCollabStore((s) => s.participants);
  const me = useCollabStore((s) => s.clientId);

  const visible = participants.filter(
    (p) => p.clientId !== me && p.cursor && p.activePanelId === panelId,
  );
  if (!visible.length) return null;

  const k = 1 / Math.max(zoom, 0.05);

  return (
    <Layer listening={false}>
      {visible.map((p) => (
        <Group key={p.clientId} x={p.cursor!.x} y={p.cursor!.y} listening={false}>
          <Circle radius={5 * k} fill={p.color} />
          <Circle radius={9 * k} stroke={p.color} strokeWidth={1.5 * k} opacity={0.6} />
          <Label x={10 * k} y={10 * k} listening={false}>
            <Tag fill={p.color} cornerRadius={3 * k} />
            <Text
              text={p.name}
              fontSize={12 * k}
              padding={4 * k}
              fill="#0b1220"
              listening={false}
            />
          </Label>
        </Group>
      ))}
    </Layer>
  );
}
