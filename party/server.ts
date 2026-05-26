import type * as Party from 'partykit/server';
import setsJson from '../public/data/sets.json';
import {
  type RoomState,
  type Question,
  type Mode,
  emptyRoom,
  addPlayer,
  rejoinPlayer,
  markDisconnected,
  kickPlayer,
  setSelection,
  startGame,
  applyAnswer,
  markFinished,
  maybeEndGame,
  endGameByHost,
  resetToLobby,
  connectedPlayerCount,
  awardWins,
  MAX_PLAYERS,
} from './room-state';
import { mulberry32, hashString, seededShuffle } from './rng';
import { observations, taxonomy, type Observation } from './data-loader';
import { scoreAnswer, calculateTimedScore, type Scoring } from './scoring';
import { generateBugs101Distractors, generateGenusDistractors, generateDistractors } from '../src/scripts/game-engine.js';
import { generateCode } from './codes';
import { checkRateLimit } from './rate-limit';
import { createToken, verifyCreateToken } from './create-token';

const IDLE_TTL_MS = 30 * 60 * 1000;
const HARD_TTL_MS = 4 * 60 * 60 * 1000;
const CREATE_ROOM_ID = '__create';
const SOFT_CAP_ROOMS = 200;

let liveRoomCount = 0;

type SetMeta = {
  setKey: string;
  name: string;
  scoring: Scoring;
  observationIndexes: number[];
};

type PublicPlayer = Omit<RoomState['players'][number], 'connectionId'>;
type PublicState = Omit<RoomState, 'players' | 'questions'> & {
  players: PublicPlayer[];
  questions: [];
};

const SETS: Record<string, SetMeta> = Object.fromEntries(
  Object.entries(setsJson as Record<string, any>).map(([k, v]) => [
    k,
    {
      setKey: k,
      name: v.name,
      scoring: v.scoring as Scoring,
      observationIndexes: v.observation_ids as number[],
    },
  ])
);

export default class Room implements Party.Server {
  state: RoomState;
  connToUser = new Map<string, string>();
  createdAt = Date.now();
  lastActivity = Date.now();
  atCapacity = false;

  constructor(readonly room: Party.Room) {
    if (room.id !== CREATE_ROOM_ID) {
      liveRoomCount++;
      if (liveRoomCount > SOFT_CAP_ROOMS) this.atCapacity = true;
    }
    this.state = emptyRoom(room.id);
    this.scheduleIdleSweep();
  }

  onConnect(conn: Party.Connection) {
    if (this.atCapacity) {
      this.sendError(conn, 'AT_CAPACITY', 'Server at capacity, try again later');
      conn.close();
      return;
    }
    this.touch();
  }

  async onRequest(req: Party.Request) {
    if (this.room.id !== CREATE_ROOM_ID) {
      return withCors(new Response('Not found', { status: 404 }));
    }
    if (req.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }
    if (req.method !== 'POST') {
      return withCors(new Response('Method not allowed', { status: 405 }));
    }
    if (liveRoomCount >= SOFT_CAP_ROOMS) {
      return withCors(Response.json({ error: 'AT_CAPACITY' }, { status: 503 }));
    }

    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      return withCors(Response.json({ error: 'RATE_LIMITED', retryAfterMs: limit.retryAfterMs }, { status: 429 }));
    }

    const code = generateCode();
    const token = await createToken(code, getCreateSecret(this.room));
    return withCors(Response.json({ code, createToken: token }));
  }

  async onMessage(raw: string, sender: Party.Connection) {
    this.touch();
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.sendError(sender, 'BAD_JSON', 'Invalid JSON');
      return;
    }

    switch (msg.type) {
      case 'identify':
        return this.handleIdentify(msg, sender);
      case 'set-selection':
        return this.handleSetSelection(msg, sender);
      case 'start-game':
        return this.handleStartGame(sender);
      case 'submit-answer':
        return this.handleSubmitAnswer(msg, sender);
      case 'time-up':
        return this.handleTimeUp(sender);
      case 'streak-broken':
        return this.handleStreakBroken(sender);
      case 'end-game':
        return this.handleEndGame(sender);
      case 'play-again':
        return this.handlePlayAgain(sender);
      case 'kick-player':
        return this.handleKick(msg, sender);
      default:
        this.sendError(sender, 'UNKNOWN_TYPE', `Unknown message type: ${String(msg.type)}`);
    }
  }

  onClose(conn: Party.Connection) {
    const userId = this.connToUser.get(conn.id);
    this.connToUser.delete(conn.id);
    if (!userId) return;
    this.state = markDisconnected(this.state, conn.id);
    this.broadcastState();
  }

  private async handleIdentify(msg: any, sender: Party.Connection) {
    const { userId, displayName } = msg;
    if (typeof userId !== 'string' || !userId) {
      return this.sendError(sender, 'BAD_IDENTIFY', 'userId required');
    }
    const cleanName = sanitizeDisplayName(displayName);
    if (!cleanName) {
      return this.sendError(sender, 'BAD_DISPLAY_NAME', 'Display name required (1-20 chars)');
    }

    if (this.state.players.length === 0) {
      const allowedToCreate = await verifyCreateToken(msg.createToken, this.room.id, getCreateSecret(this.room));
      if (!allowedToCreate) {
        this.sendError(sender, 'ROOM_NOT_FOUND', 'No active room with that code');
        sender.close();
        return;
      }
    }

    const existing = this.state.players.find(p => p.id === userId);
    if (existing) {
      this.state = rejoinPlayer(this.state, userId, sender.id);
      this.state = {
        ...this.state,
        players: this.state.players.map(p =>
          p.id === userId ? { ...p, displayName: cleanName, connectionId: sender.id } : p
        ),
      };
    } else {
      if (this.state.status !== 'lobby') {
        this.sendError(sender, 'GAME_IN_PROGRESS', 'Cannot join, game already started');
        sender.close();
        return;
      }
      if (this.state.players.length >= MAX_PLAYERS) {
        this.sendError(sender, 'ROOM_FULL', `Room is full (${MAX_PLAYERS} players max)`);
        sender.close();
        return;
      }
      this.state = addPlayer(this.state, { id: userId, connectionId: sender.id, displayName: cleanName, nextQuestionIndex: 0, questionStartedAt: null });
    }

    this.connToUser.set(sender.id, userId);
    this.broadcastState();
    if (this.state.status === 'playing') {
      this.sendGameStarted(sender, userId);
    }
  }

  private handleSetSelection(msg: any, sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return this.sendError(sender, 'NOT_IDENTIFIED', 'identify first');
    const { setKey, mode } = msg;
    if (!SETS[setKey]) return this.sendError(sender, 'UNKNOWN_SET', `Unknown set: ${setKey}`);
    if (!isMode(mode)) return this.sendError(sender, 'UNKNOWN_MODE', `Unknown mode: ${String(mode)}`);
    this.state = setSelection(this.state, userId, setKey, mode);
    this.broadcastState();
  }

  private handleStartGame(sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return this.sendError(sender, 'NOT_IDENTIFIED', 'identify first');
    if (this.state.hostId !== userId) return this.sendError(sender, 'NOT_HOST', 'Only host can start');
    if (!this.state.selection) return this.sendError(sender, 'NO_SELECTION', 'Pick a set and mode first');
    if (connectedPlayerCount(this.state) < 2) return this.sendError(sender, 'NOT_ENOUGH_PLAYERS', 'Need at least 2 connected players');

    const { setKey, mode } = this.state.selection;
    const setMeta = SETS[setKey];
    const questions = buildQuestionSequence(this.room.id, setMeta, mode);
    const totalQuestions = mode === 'classic' ? questions.length : -1;
    this.state = startGame(this.state, userId, questions, totalQuestions);
    this.broadcastGameStarted();
    this.broadcastState();
  }

  private handleSubmitAnswer(msg: any, sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return this.sendError(sender, 'NOT_IDENTIFIED', 'identify first');
    if (this.state.status !== 'playing') return this.sendError(sender, 'NOT_PLAYING', 'Game not in progress');

    const { questionIndex, choiceIndex } = msg;
    if (!Number.isInteger(questionIndex)) return this.sendError(sender, 'BAD_QUESTION_INDEX', 'No such question');
    const q = this.state.questions[questionIndex];
    if (!q) return this.sendError(sender, 'BAD_QUESTION_INDEX', 'No such question');
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= q.choiceObservationIndexes.length) {
      return this.sendError(sender, 'BAD_CHOICE_INDEX', 'No such choice');
    }

    const player = this.state.players.find(p => p.id === userId);
    if (!player || player.finished) return this.sendError(sender, 'ALREADY_FINISHED', 'You are done');
    if (questionIndex !== player.nextQuestionIndex) {
      return this.sendError(sender, 'OUT_OF_ORDER_ANSWER', 'Answer the next unanswered question only');
    }

    const pickedObservationIndex = q.choiceObservationIndexes[choiceIndex];
    const correctObs = observations[q.correctObservationIndex];
    const pickedObs = observations[pickedObservationIndex];
    if (!correctObs || !pickedObs) return this.sendError(sender, 'BAD_OBS_ID', 'Unknown observation');

    const now = Date.now();
    const elapsedMs = player.questionStartedAt ? now - player.questionStartedAt : sanitizeElapsedMs(msg.elapsedMs);
    const scoring = SETS[this.state.selection!.setKey].scoring;
    const baseScore = scoreAnswer(pickedObs, correctObs, scoring);
    const score = this.state.selection!.mode === 'time_trial' && baseScore > 0
      ? calculateTimedScore(elapsedMs)
      : baseScore;

    this.state = applyAnswer(this.state, userId, questionIndex, score, now);

    sender.send(JSON.stringify({
      type: 'question-result',
      questionIndex,
      score,
      correctChoiceIndex: q.choiceObservationIndexes.indexOf(q.correctObservationIndex),
      correctObservationIndex: q.correctObservationIndex,
    }));

    const updatedPlayer = this.state.players.find(p => p.id === userId);
    if (this.state.selection!.mode === 'streak' && score !== 100) {
      this.state = markFinished(this.state, userId);
    } else if (updatedPlayer && updatedPlayer.nextQuestionIndex >= this.state.questions.length) {
      this.state = markFinished(this.state, userId);
    }

    this.broadcastLeaderboard();
    this.state = maybeEndGame(this.state);
    this.finalizeIfEnded();
  }

  private handleTimeUp(sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return;
    if (this.state.selection?.mode !== 'time_trial') return;
    this.state = markFinished(this.state, userId);
    this.state = maybeEndGame(this.state);
    this.finalizeIfEnded();
  }

  private handleStreakBroken(sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return;
    if (this.state.selection?.mode !== 'streak') return;
    this.state = markFinished(this.state, userId);
    this.state = maybeEndGame(this.state);
    this.finalizeIfEnded();
  }

  private handleEndGame(sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return this.sendError(sender, 'NOT_IDENTIFIED', 'identify first');
    this.state = endGameByHost(this.state, userId);
    this.finalizeIfEnded();
  }

  private finalizeIfEnded() {
    if (this.state.status === 'ended') {
      this.state = awardWins(this.state);
      this.broadcastGameOver();
      this.broadcastState();
    } else {
      this.broadcastState();
    }
  }

  private handlePlayAgain(sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return this.sendError(sender, 'NOT_IDENTIFIED', 'identify first');
    if (this.state.hostId !== userId) return this.sendError(sender, 'NOT_HOST', 'Only host can restart the room');
    const before = this.state.status;
    this.state = resetToLobby(this.state, userId);
    if (this.state.status === 'lobby' && before !== 'lobby') this.broadcastState();
  }

  private handleKick(msg: any, sender: Party.Connection) {
    const userId = this.connToUser.get(sender.id);
    if (!userId) return;
    const playerId = typeof msg.playerId === 'string' ? msg.playerId : '';
    const target = this.state.players.find(p => p.id === playerId);
    this.state = kickPlayer(this.state, userId, playerId);
    if (target && !this.state.players.find(p => p.id === playerId)) {
      for (const [connId, uId] of this.connToUser) {
        if (uId !== playerId) continue;
        const conn = this.room.getConnection(connId);
        if (conn) {
          conn.send(JSON.stringify({ type: 'kicked' }));
          conn.close();
        }
        break;
      }
      this.broadcastState();
    }
  }

  private gameStartedPayload(userId?: string) {
    if (!this.state.selection) return null;
    const { setKey, mode } = this.state.selection;
    const setMeta = SETS[setKey];
    const player = userId ? this.state.players.find(p => p.id === userId) : null;
    return {
      type: 'game-started',
      questions: this.state.questions,
      setMeta: { setKey, mode, name: setMeta.name, scoring: setMeta.scoring },
      resume: player ? {
        nextQuestionIndex: player.nextQuestionIndex,
        score: player.score,
        streak: player.streak,
        finished: player.finished,
      } : undefined,
    };
  }

  private broadcastGameStarted() {
    const payload = this.gameStartedPayload();
    if (payload) this.room.broadcast(JSON.stringify(payload));
  }

  private sendGameStarted(conn: Party.Connection, userId: string) {
    const payload = this.gameStartedPayload(userId);
    if (payload) conn.send(JSON.stringify(payload));
  }

  private publicState(): PublicState {
    return {
      code: this.state.code,
      hostId: this.state.hostId,
      status: this.state.status,
      players: this.state.players.map(({ connectionId: _connectionId, ...player }) => player),
      selection: this.state.selection,
      questions: [],
      totalQuestions: this.state.totalQuestions,
      startedAt: this.state.startedAt,
      endedAt: this.state.endedAt,
    };
  }

  private broadcastState() {
    this.room.broadcast(JSON.stringify({ type: 'state', state: this.publicState() }));
  }

  private broadcastLeaderboard() {
    const leaderboard = this.state.players
      .map(p => ({
        id: p.id,
        displayName: p.displayName,
        score: p.score,
        streak: p.streak,
        nextQuestionIndex: p.nextQuestionIndex,
        finished: p.finished,
      }))
      .sort((a, b) => b.score - a.score);
    this.room.broadcast(JSON.stringify({ type: 'leaderboard-update', leaderboard }));
  }

  private broadcastGameOver() {
    const finalLeaderboard = this.state.players
      .map(p => ({ id: p.id, displayName: p.displayName, score: p.score, streak: p.streak }))
      .sort((a, b) => b.score - a.score);
    const durationMs = (this.state.endedAt || Date.now()) - (this.state.startedAt || Date.now());
    this.room.broadcast(JSON.stringify({ type: 'game-over', finalLeaderboard, durationMs }));
  }

  private sendError(conn: Party.Connection, code: string, message: string) {
    conn.send(JSON.stringify({ type: 'error', code, message }));
  }

  private touch() {
    this.lastActivity = Date.now();
  }

  private scheduleIdleSweep() {
    setInterval(() => {
      const now = Date.now();
      const idleFor = now - this.lastActivity;
      const aliveFor = now - this.createdAt;
      if (idleFor <= IDLE_TTL_MS && aliveFor <= HARD_TTL_MS) return;
      for (const conn of this.room.getConnections()) conn.close();
      // TODO: monitor liveRoomCount after deploy; this conservative v1 cap only resets when the runtime recycles.
    }, 5 * 60 * 1000);
  }
}

function isMode(mode: unknown): mode is Mode {
  return mode === 'classic' || mode === 'time_trial' || mode === 'streak';
}

function sanitizeDisplayName(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeElapsedMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(60_000, value));
}

function getCreateSecret(room: Party.Room): string {
  return (room.env as any)?.PARTY_CREATE_SECRET || 'dev-create-secret-change-me';
}

function withCors(res: Response): Response {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}

function buildQuestionSequence(roomCode: string, setMeta: SetMeta, mode: Mode): Question[] {
  const seed = hashString(roomCode + '|questions');
  const rng = mulberry32(seed);
  const observationIndexByObject = new Map<Observation, number>(observations.map((obs, index) => [obs, index]));
  const pool = setMeta.observationIndexes
    .map(index => ({ index, observation: observations[index] }))
    .filter((item): item is { index: number; observation: Observation } => Boolean(item.observation));
  const shuffledPool = seededShuffle(pool, rng);
  const length = mode === 'classic' ? Math.min(10, shuffledPool.length) : Math.min(100, shuffledPool.length);
  const taken = shuffledPool.slice(0, length);

  return taken.map(({ index: correctObservationIndex, observation: correct }) => {
    let distractors: Observation[];
    if (setMeta.scoring === 'binary') {
      distractors = generateBugs101Distractors(correct, taxonomy, observations, rng);
    } else if (setMeta.scoring === 'genus') {
      distractors = generateGenusDistractors(correct, taxonomy, observations, rng);
    } else {
      distractors = generateDistractors(correct, taxonomy, observations, rng);
    }
    const distractorIndexes = distractors
      .map(d => observationIndexByObject.get(d))
      .filter((index): index is number => Number.isInteger(index));
    const choiceObservationIndexes = seededShuffle(
      [correctObservationIndex, ...distractorIndexes].slice(0, 4),
      rng
    );
    return { correctObservationIndex, choiceObservationIndexes };
  });
}
