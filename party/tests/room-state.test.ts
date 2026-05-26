import { describe, it, expect } from 'vitest';
import {
  emptyRoom, addPlayer, kickPlayer, setSelection,
  startGame, applyAnswer, maybeEndGame,
  endGameByHost, markDisconnected, rejoinPlayer, MAX_PLAYERS,
} from '../room-state';

const baseP = (id: string) => ({ id, connectionId: 'c-' + id, displayName: id, nextQuestionIndex: 0, questionStartedAt: null });

describe('addPlayer', () => {
  it('makes the first joiner the host', () => {
    const s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    expect(s.hostId).toBe('alice');
    expect(s.players).toHaveLength(1);
  });

  it('does not change host on second joiner', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    expect(s.hostId).toBe('alice');
    expect(s.players).toHaveLength(2);
  });

  it('rejects joiner past MAX_PLAYERS', () => {
    let s = emptyRoom('ABCD');
    for (let i = 0; i < MAX_PLAYERS; i++) {
      s = addPlayer(s, baseP('p' + i));
    }
    const before = s.players.length;
    s = addPlayer(s, baseP('overflow'));
    expect(s.players.length).toBe(before);
  });

  it('dedupes by userId', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('alice'));
    expect(s.players).toHaveLength(1);
  });

  it('rejects joiner once playing', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    s = setSelection(s, 'alice', 'bugs_101', 'classic');
    s = startGame(s, 'alice', [{ correctObservationIndex: 1, choiceObservationIndexes: [1, 2, 3, 4] }], 10);
    const before = s.players.length;
    s = addPlayer(s, baseP('charlie'));
    expect(s.players.length).toBe(before);
  });
});

describe('kickPlayer', () => {
  it('only host can kick', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    const after = kickPlayer(s, 'bob', 'alice');
    expect(after.players.find(p => p.id === 'alice')).toBeTruthy();
  });

  it('host can kick a non-host player', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    const after = kickPlayer(s, 'alice', 'bob');
    expect(after.players.find(p => p.id === 'bob')).toBeUndefined();
  });

  it('host cannot kick self', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    const after = kickPlayer(s, 'alice', 'alice');
    expect(after.players.find(p => p.id === 'alice')).toBeTruthy();
  });
});

describe('startGame', () => {
  it('requires at least 2 players', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = setSelection(s, 'alice', 'bugs_101', 'classic');
    s = startGame(s, 'alice', [{ correctObservationIndex: 1, choiceObservationIndexes: [1, 2, 3, 4] }], 10);
    expect(s.status).toBe('lobby');
  });

  it('requires a selection', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    s = startGame(s, 'alice', [], 10);
    expect(s.status).toBe('lobby');
  });

  it('transitions to playing when host starts with valid params', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    s = setSelection(s, 'alice', 'bugs_101', 'classic');
    s = startGame(s, 'alice', [{ correctObservationIndex: 1, choiceObservationIndexes: [1, 2, 3, 4] }], 10);
    expect(s.status).toBe('playing');
  });
});

describe('applyAnswer and maybeEndGame', () => {
  function setupPlaying() {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    s = setSelection(s, 'alice', 'bugs_101', 'classic');
    const qs = Array.from({ length: 3 }, (_, i) => ({ correctObservationIndex: i, choiceObservationIndexes: [i, 99, 98, 97] }));
    s = startGame(s, 'alice', qs, 3);
    return s;
  }

  it('accumulates score and marks finished on last question', () => {
    let s = setupPlaying();
    s = applyAnswer(s, 'alice', 0, 100);
    s = applyAnswer(s, 'alice', 1, 50);
    s = applyAnswer(s, 'alice', 2, 25);
    const alice = s.players.find(p => p.id === 'alice')!;
    expect(alice.score).toBe(175);
    expect(alice.nextQuestionIndex).toBe(3);
    expect(alice.finished).toBe(true);
  });

  it('maybeEndGame transitions to ended when all players finished', () => {
    let s = setupPlaying();
    s = applyAnswer(s, 'alice', 0, 100);
    s = applyAnswer(s, 'alice', 1, 100);
    s = applyAnswer(s, 'alice', 2, 100);
    s = applyAnswer(s, 'bob', 0, 50);
    s = applyAnswer(s, 'bob', 1, 50);
    s = applyAnswer(s, 'bob', 2, 50);
    s = maybeEndGame(s);
    expect(s.status).toBe('ended');
  });
});

describe('markDisconnected and rejoinPlayer', () => {
  it('promotes next connected player when host disconnects', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    s = markDisconnected(s, 'c-alice');
    expect(s.hostId).toBe('bob');
  });

  it('marks a disconnected player connected on rejoin', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = markDisconnected(s, 'c-alice');
    s = rejoinPlayer(s, 'alice', 'c-new');
    const alice = s.players.find(p => p.id === 'alice')!;
    expect(alice.connected).toBe(true);
    expect(alice.connectionId).toBe('c-new');
  });
});

describe('endGameByHost', () => {
  it('lets the host end an active game', () => {
    let s = addPlayer(emptyRoom('ABCD'), baseP('alice'));
    s = addPlayer(s, baseP('bob'));
    s = setSelection(s, 'alice', 'bugs_101', 'classic');
    s = startGame(s, 'alice', [{ correctObservationIndex: 1, choiceObservationIndexes: [1, 2, 3, 4] }], 10);
    s = endGameByHost(s, 'alice');
    expect(s.status).toBe('ended');
  });
});
