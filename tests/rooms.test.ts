import { describe, expect, it } from 'vitest';
import { closeRoom, createRoom, listRooms, sweepRooms, touchRoomActivity } from '../apps/server/src/rooms';

describe('Oda temizliği', () => {
  it('boşta kalma süresi son etkinlikten ölçülür, oluşturulma anından değil', () => {
    const room = createRoom('Test', 'tok_1');
    // Oda uzun süredir açık ama biraz önce hâlâ bağlantı vardı.
    room.createdAt = Date.now() - 1000 * 60 * 60 * 24;
    touchRoomActivity(room);

    expect(sweepRooms(1000 * 60 * 60)).toBe(0);
    expect(listRooms().some((r) => r.id === room.id)).toBe(true);

    // Gerçekten boşta kaldığında temizlenir.
    room.idleSince = Date.now() - 1000 * 60 * 60 * 2;
    expect(sweepRooms(1000 * 60 * 60)).toBe(1);
    expect(listRooms().some((r) => r.id === room.id)).toBe(false);
  });

  it('oda kodları benzersizdir', () => {
    const a = createRoom('A', 'tok_a');
    const b = createRoom('B', 'tok_b');
    expect(a.code).not.toBe(b.code);
    closeRoom(a.id);
    closeRoom(b.id);
  });
});
