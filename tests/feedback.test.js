import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Browser globals needed by feedback.js ───────────────────────────────────
// feedback.js references these at module-load time (rehydrate, visibilitychange)
// and at call time (logSessionStart reads navigator.userAgent, document.referrer,
// sessionStorage; logGeneralFeedback reads window.location).

vi.stubGlobal('navigator', {
  sendBeacon: vi.fn(),
  userAgent: 'Mozilla/5.0 (test)',
});

vi.stubGlobal('document', {
  referrer: '',
  visibilityState: 'visible',
  addEventListener: vi.fn(),
});

vi.stubGlobal('window', {
  location: { pathname: '/test' },
});

const sessionStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('sessionStorage', sessionStorageMock);

vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-uuid-1234') });

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
vi.stubGlobal('fetch', fetchSpy);

// ─── Make import.meta.env.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL available ──────────
// vitest exposes import.meta.env; we set the var so WEBHOOK_URL is non-empty,
// which allows enqueue() to actually push events and flush() to call fetch.
vi.stubEnv('PUBLIC_GOOGLE_SHEET_WEBHOOK_URL', 'https://script.google.com/test-webhook');

describe('feedback pipeline', () => {
  // Each test imports a fresh module copy so queue state doesn't leak.
  let feedback;

  beforeEach(async () => {
    vi.resetModules();
    sessionStorageMock.getItem.mockReturnValue(null);
    fetchSpy.mockClear();
    vi.mocked(navigator.sendBeacon).mockClear();
    feedback = await import('../src/scripts/feedback.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Batched array ────────────────────────────────────────────────────────────

  it('flush sends a JSON array (batch), not individual events', () => {
    feedback.logSessionStart('sess-1', 'bugs_101', 'classic');

    // logSessionStart calls enqueue then flush — fetch should have fired once
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].type).toBe('session_start');
  });

  it('flush batches multiple queued events into one fetch call', async () => {
    // Use fake timers so the 5s auto-flush timer does not fire between calls
    vi.useFakeTimers();

    // logRoundComplete does NOT flush immediately — events accumulate
    feedback.logRoundComplete('sess-b', 1, 101, 'Apis mellifera', 'Apis mellifera', 100, 2000, 'bugs_101', 'classic');
    feedback.logRoundComplete('sess-b', 2, 102, 'Bombus terrestris', 'Bombus terrestris', 100, 1800, 'bugs_101', 'classic');

    // No fetch yet — still waiting for timer or explicit flush
    expect(fetchSpy).not.toHaveBeenCalled();

    // Manually flush — should send both events in one request
    feedback.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].type).toBe('round_complete');
    expect(body[1].type).toBe('round_complete');
  });

  // ── keepalive flag ───────────────────────────────────────────────────────────

  it('includes keepalive: true on fetch calls', () => {
    feedback.logSessionStart('sess-2', 'bugs_101', 'classic');

    const fetchOptions = fetchSpy.mock.calls[0][1];
    expect(fetchOptions.keepalive).toBe(true);
    expect(fetchOptions.method).toBe('POST');
  });

  // ── event_id and timestamp ───────────────────────────────────────────────────

  it('event payloads include event_id and timestamp', () => {
    feedback.logSessionStart('sess-3', 'bugs_101', 'classic');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const event = body.find(e => e.type === 'session_start');
    expect(event).toBeDefined();
    expect(event.event_id).toBe('test-uuid-1234');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('session_end events also carry event_id and timestamp', () => {
    feedback.logSessionEnd('sess-3b', 500, 10, 'bugs_101', true, false, 'classic');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const event = body.find(e => e.type === 'session_end');
    expect(event).toBeDefined();
    expect(event.event_id).toBe('test-uuid-1234');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ── Immediate flush vs deferred ──────────────────────────────────────────────

  it('logSessionStart calls flush immediately', () => {
    feedback.logSessionStart('sess-4', 'bugs_101', 'classic');
    // Should have called fetch synchronously (not waiting for timer)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('logSessionEnd calls flush immediately', () => {
    feedback.logSessionEnd('sess-5', 300, 5, 'bugs_101', true, false, 'classic');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('logRoundComplete does NOT immediately flush', () => {
    vi.useFakeTimers();
    feedback.logRoundComplete('sess-6', 1, 201, 'Apis mellifera', 'Apis mellifera', 100, 3000, 'bugs_101', 'classic');
    // No fetch call — event is queued, waiting for timer or MAX_BATCH
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Content-Type ─────────────────────────────────────────────────────────────

  it('sends Content-Type: text/plain (required by Apps Script CORS)', () => {
    feedback.logSessionEnd('sess-7', 0, 0, 'bugs_101', false, false, 'classic');

    const fetchOptions = fetchSpy.mock.calls[0][1];
    expect(fetchOptions.headers['Content-Type']).toBe('text/plain');
  });

  // ── No webhook → no fetch ────────────────────────────────────────────────────

  it('does not call fetch when WEBHOOK_URL is empty', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_GOOGLE_SHEET_WEBHOOK_URL', '');
    fetchSpy.mockClear();

    const noUrlFeedback = await import('../src/scripts/feedback.js');
    noUrlFeedback.logSessionStart('sess-8', 'bugs_101', 'classic');

    expect(fetchSpy).not.toHaveBeenCalled();

    // Restore for subsequent tests
    vi.stubEnv('PUBLIC_GOOGLE_SHEET_WEBHOOK_URL', 'https://script.google.com/test-webhook');
  });
});
