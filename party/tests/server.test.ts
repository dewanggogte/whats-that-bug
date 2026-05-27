import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Room from '../server';
import { createToken } from '../create-token';

const SECRET = 'test-secret';

describe('Room identify', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a fresh create token when the room already has connected players', async () => {
    const fakeRoom = new FakeRoom('ABCD');
    const server = new Room(fakeRoom as any);
    const host = fakeRoom.connect('host-conn');
    const hostToken = await createToken('ABCD', SECRET);

    await server.onMessage(JSON.stringify({
      type: 'identify',
      userId: 'host-user',
      displayName: 'Host',
      createToken: hostToken,
    }), host as any);

    const guest = fakeRoom.connect('guest-conn');
    const collisionToken = await createToken('ABCD', SECRET);

    await server.onMessage(JSON.stringify({
      type: 'identify',
      userId: 'new-creator-user',
      displayName: 'New Creator',
      createToken: collisionToken,
    }), guest as any);

    expect(server.state.players).toHaveLength(1);
    expect(server.state.players[0].userId).toBe('host-user');
    expect(guest.closed).toBe(true);
    expect(guest.messages).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'ROOM_ALREADY_ACTIVE',
    }));
  });

  it('does not let a fresh create token rejoin a stale saved seat as a guest', async () => {
    const fakeRoom = new FakeRoom('ABCD');
    const server = new Room(fakeRoom as any);
    const host = fakeRoom.connect('host-conn');
    const hostToken = await createToken('ABCD', SECRET);

    await server.onMessage(JSON.stringify({
      type: 'identify',
      userId: 'host-user',
      displayName: 'Host',
      createToken: hostToken,
    }), host as any);

    const oldGuest = fakeRoom.connect('old-guest-conn');
    await server.onMessage(JSON.stringify({
      type: 'identify',
      userId: 'creator-user',
      displayName: 'Old Guest',
    }), oldGuest as any);
    const oldGuestIdentified = oldGuest.messages.find(isIdentifiedMessage);

    const creator = fakeRoom.connect('creator-conn');
    const collisionToken = await createToken('ABCD', SECRET);
    await server.onMessage(JSON.stringify({
      type: 'identify',
      userId: 'creator-user',
      displayName: 'New Creator',
      createToken: collisionToken,
      rejoinToken: oldGuestIdentified?.rejoinToken,
    }), creator as any);

    expect(server.state.players).toHaveLength(2);
    expect(server.state.players.find(p => p.userId === 'creator-user')?.displayName).toBe('Old Guest');
    expect(creator.closed).toBe(true);
    expect(creator.messages).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'ROOM_ALREADY_ACTIVE',
    }));
  });
});

function isIdentifiedMessage(msg: unknown): msg is { type: 'identified'; rejoinToken: string } {
  return typeof msg === 'object' && msg !== null && (msg as any).type === 'identified';
}

class FakeRoom {
  env = { PARTY_CREATE_SECRET: SECRET };
  storage = {};
  connections = new Map<string, FakeConnection>();
  broadcasts: unknown[] = [];

  constructor(readonly id: string) {}

  connect(id: string) {
    const conn = new FakeConnection(id);
    this.connections.set(id, conn);
    return conn;
  }

  broadcast(raw: string) {
    this.broadcasts.push(JSON.parse(raw));
  }

  getConnection(id: string) {
    return this.connections.get(id);
  }

  getConnections() {
    return this.connections.values();
  }
}

class FakeConnection {
  messages: unknown[] = [];
  closed = false;

  constructor(readonly id: string) {}

  send(raw: string) {
    this.messages.push(JSON.parse(raw));
  }

  close() {
    this.closed = true;
  }
}
