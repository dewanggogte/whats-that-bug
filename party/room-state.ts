export type Mode = 'classic' | 'time_trial' | 'streak';
export type Status = 'lobby' | 'playing' | 'ended';

export type Player = {
  id: string;
  connectionId: string | null;
  displayName: string;
  connected: boolean;
  score: number;
  streak: number;
  nextQuestionIndex: number;
  questionStartedAt: number | null;
  finished: boolean;
  wins: number;
};

export type Question = {
  correctObservationIndex: number;
  choiceObservationIndexes: number[];
};

export type RoomState = {
  code: string;
  hostId: string | null;
  status: Status;
  players: Player[];
  selection: { setKey: string; mode: Mode } | null;
  questions: Question[];
  totalQuestions: number;
  startedAt: number | null;
  endedAt: number | null;
};

export const MAX_PLAYERS = 5;

export function emptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    status: 'lobby',
    players: [],
    selection: null,
    questions: [],
    totalQuestions: 0,
    startedAt: null,
    endedAt: null,
  };
}

export function addPlayer(state: RoomState, p: Omit<Player, 'connected' | 'score' | 'streak' | 'finished' | 'wins'>): RoomState {
  if (state.status !== 'lobby') return state;
  if (state.players.length >= MAX_PLAYERS) return state;
  if (state.players.some(x => x.id === p.id)) return state;
  const newPlayer: Player = {
    ...p,
    connected: true,
    score: 0,
    streak: 0,
    nextQuestionIndex: 0,
    questionStartedAt: null,
    finished: false,
    wins: 0,
  };
  const players = [...state.players, newPlayer];
  const hostId = state.hostId ?? p.id;
  return { ...state, players, hostId };
}

export function rejoinPlayer(state: RoomState, userId: string, connectionId: string): RoomState {
  const players = state.players.map(p =>
    p.id === userId ? { ...p, connectionId, connected: true } : p
  );
  return { ...state, players };
}

export function markDisconnected(state: RoomState, connectionId: string): RoomState {
  const players = state.players.map(p =>
    p.connectionId === connectionId ? { ...p, connected: false, connectionId: null } : p
  );
  let hostId = state.hostId;
  const host = players.find(p => p.id === hostId);
  if (host && !host.connected) {
    const nextHost = players.find(p => p.connected);
    hostId = nextHost ? nextHost.id : hostId;
  }
  return { ...state, players, hostId };
}

export function kickPlayer(state: RoomState, kickerId: string, targetId: string): RoomState {
  if (state.hostId !== kickerId) return state;
  if (kickerId === targetId) return state;
  const players = state.players.filter(p => p.id !== targetId);
  return { ...state, players };
}

export function setSelection(state: RoomState, hostId: string, setKey: string, mode: Mode): RoomState {
  if (state.hostId !== hostId) return state;
  if (state.status !== 'lobby') return state;
  return { ...state, selection: { setKey, mode } };
}

export function connectedPlayerCount(state: RoomState): number {
  return state.players.filter(p => p.connected).length;
}

export function startGame(state: RoomState, hostId: string, questions: Question[], totalQuestions: number, now: number = Date.now()): RoomState {
  if (state.hostId !== hostId) return state;
  if (state.status !== 'lobby') return state;
  if (!state.selection) return state;
  if (connectedPlayerCount(state) < 2) return state;
  return {
    ...state,
    status: 'playing',
    players: state.players.map(p => ({
      ...p,
      score: 0,
      streak: 0,
      nextQuestionIndex: 0,
      questionStartedAt: now,
      finished: false,
    })),
    questions,
    totalQuestions,
    startedAt: now,
    endedAt: null,
  };
}

export function applyAnswer(
  state: RoomState,
  playerId: string,
  questionIndex: number,
  score: number,
  now: number = Date.now()
): RoomState {
  const players = state.players.map(p => {
    if (p.id !== playerId) return p;
    const newStreak = score === 100 ? p.streak + 1 : (state.selection?.mode === 'streak' ? p.streak : 0);
    const isLastQuestion = state.selection?.mode === 'classic' && questionIndex >= state.totalQuestions - 1;
    return {
      ...p,
      score: p.score + score,
      streak: newStreak,
      nextQuestionIndex: p.nextQuestionIndex + 1,
      questionStartedAt: isLastQuestion ? p.questionStartedAt : now,
      finished: isLastQuestion || p.finished,
    };
  });
  return { ...state, players };
}

export function markFinished(state: RoomState, playerId: string): RoomState {
  const players = state.players.map(p =>
    p.id === playerId ? { ...p, finished: true } : p
  );
  return { ...state, players };
}

export function maybeEndGame(state: RoomState, now: number = Date.now()): RoomState {
  if (state.status !== 'playing') return state;
  const allFinished = state.players.every(p => p.finished || !p.connected);
  if (!allFinished) return state;
  return { ...state, status: 'ended', endedAt: now };
}

export function endGameByHost(state: RoomState, hostId: string, now: number = Date.now()): RoomState {
  if (state.hostId !== hostId) return state;
  if (state.status !== 'playing') return state;
  return { ...state, status: 'ended', endedAt: now };
}

export function awardWins(state: RoomState): RoomState {
  if (state.players.length === 0) return state;
  const maxScore = Math.max(...state.players.map(p => p.score));
  if (maxScore <= 0) return state;
  const players = state.players.map(p =>
    p.score === maxScore ? { ...p, wins: p.wins + 1 } : p
  );
  return { ...state, players };
}

export function resetToLobby(state: RoomState, hostId: string): RoomState {
  if (state.hostId !== hostId) return state;
  if (state.status === 'lobby') return state;
  return {
    ...state,
    status: 'lobby',
    players: state.players.map(p => ({
      ...p,
      score: 0,
      streak: 0,
      nextQuestionIndex: 0,
      questionStartedAt: null,
      finished: false,
    })),
    questions: [],
    totalQuestions: 0,
    startedAt: null,
    endedAt: null,
  };
}
