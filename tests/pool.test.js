import { describe, it, expect } from 'vitest';
import { hashDate, addDays, avoidWindowSize, topUpSchedule, buildPoolEntries } from '../scripts/lib/pool.mjs';

describe('hashDate (node lib)', () => {
  it('is deterministic', () => {
    expect(hashDate('2026-05-18')).toBe(hashDate('2026-05-18'));
  });
});

describe('addDays', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-05-31', 1)).toBe('2026-06-01');
  });
  it('subtracts with negative n', () => {
    expect(addDays('2026-06-01', -1)).toBe('2026-05-31');
  });
});

describe('avoidWindowSize', () => {
  it('is poolSize-1 when small', () => {
    expect(avoidWindowSize(10)).toBe(9);
  });
  it('caps at 30', () => {
    expect(avoidWindowSize(100)).toBe(30);
  });
});

describe('topUpSchedule', () => {
  const pool = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

  it('fills exactly `days` future dates', () => {
    const s = topUpSchedule(pool, {}, '2026-05-18', 5);
    expect(Object.keys(s).sort()).toEqual(
      ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22']
    );
  });

  it('never overwrites an existing schedule entry', () => {
    const s = topUpSchedule(pool, { '2026-05-18': 99 }, '2026-05-18', 3);
    expect(s['2026-05-18']).toBe(99);
  });

  it('is deterministic', () => {
    const a = topUpSchedule(pool, {}, '2026-05-18', 20);
    const b = topUpSchedule(pool, {}, '2026-05-18', 20);
    expect(a).toEqual(b);
  });

  it('does not repeat an id within the avoid window', () => {
    const s = topUpSchedule(pool, {}, '2026-05-18', 5); // window = min(4,30)=4
    const seq = Object.keys(s).sort().map(k => s[k]);
    for (let i = 1; i < seq.length; i++) {
      expect(seq.slice(Math.max(0, i - 4), i)).not.toContain(seq[i]);
    }
  });

  it('only assigns ids that exist in the pool', () => {
    const s = topUpSchedule(pool, {}, '2026-05-18', 30);
    const ids = new Set(pool.map(p => p.id));
    for (const v of Object.values(s)) expect(ids.has(v)).toBe(true);
  });
});

describe('buildPoolEntries', () => {
  const candidatesById = new Map([
    [200, { id: 200, photo_url: 'p200', attribution: 'a200', inat_url: 'i200',
            taxon: { order: 'Coleoptera', family: 'Carabidae', species: 'Carabus x', common_name: 'Ground Beetle' } }],
    [300, { id: 300, photo_url: 'p300', attribution: 'a300', inat_url: 'i300',
            taxon: { order: 'Mecoptera', family: 'Bittacidae', species: 'Bittacus y', common_name: 'Hangingfly' } }],
  ]);
  const manifest = { challenges: [{
    date: '2026-04-05', number: 1,
    bugs101: { observation_id: 100, crops: ['daily/2026-04-05/b101_1.jpg','daily/2026-04-05/b101_2.jpg','daily/2026-04-05/b101_3.jpg'],
      reveal: 'daily/2026-04-05/b101_full.jpg', attribution: 'attrA', wikipedia_summary: 'wikiA',
      inat_url: 'inatA', center_x: 0.2, center_y: 0.5, answer_order: 'Ixodida', answer_common: 'Tick' },
    allbugs: { observation_id: 200, crops: [], reveal: 'daily/2026-04-05/all_full.jpg', attribution: 'attrB',
      wikipedia_summary: '', inat_url: 'inatB', center_x: 0.6, center_y: 0.4,
      answer_genus: 'Carabus', answer_common: 'Ground Beetle' },
  }, {
    date: '2026-04-06', number: 2,
    allbugs: { observation_id: 300, crops: [], reveal: 'r', attribution: 'attrC', wikipedia_summary: '',
      inat_url: 'inatC', center_x: 0.5, center_y: 0.5, answer_genus: 'Bittacus', answer_common: 'Hangingfly' },
  }] };

  it('keeps bugs101 entries verbatim (name/order/center)', () => {
    const { entries } = buildPoolEntries(manifest, candidatesById);
    const t = entries.find(e => e.id === 100);
    expect(t).toMatchObject({ id: 100, answer_common: 'Tick', answer_order: 'Ixodida',
      attribution: 'attrA', wikipedia_summary: 'wikiA', inat_url: 'inatA', center_x: 0.2, center_y: 0.5, source: 'bugs101' });
  });

  it('re-derives allbugs entries to a Bugs 101 name via taxon', () => {
    const { entries } = buildPoolEntries(manifest, candidatesById);
    const b = entries.find(e => e.id === 200);
    expect(b).toMatchObject({ id: 200, answer_common: 'Beetle', answer_order: 'Coleoptera', source: 'allbugs' });
  });

  it('drops allbugs entries with no valid Bugs 101 name', () => {
    const { entries, dropped } = buildPoolEntries(manifest, candidatesById);
    expect(entries.find(e => e.id === 300)).toBeUndefined();
    expect(dropped).toContainEqual({ id: 300, reason: 'no valid Bugs 101 name (Mecoptera)' });
  });

  it('de-dupes by observation id (first wins)', () => {
    const dup = { challenges: [...manifest.challenges,
      { date: '2026-04-07', number: 3, bugs101: { ...manifest.challenges[0].bugs101 } }] };
    const { entries } = buildPoolEntries(dup, candidatesById);
    expect(entries.filter(e => e.id === 100).length).toBe(1);
  });
});
