import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '@/game/store';
import { ALL_CARDS, isMajor } from '@/tarot/data';
import { SUITS } from '@/tarot/data/minorSource';
import type { SuitKey } from '@/tarot/types';
import { CardArt, SealedCard } from '@/ui/CardArt';

type Filter =
  | { kind: 'all' } | { kind: 'major' } | { kind: 'minor' }
  | { kind: 'suit'; suit: SuitKey }
  | { kind: 'owned' } | { kind: 'sealed' };

const FILTERS: Array<{ key: string; label: string; filter: Filter }> = [
  { key: 'all', label: '全部', filter: { kind: 'all' } },
  { key: 'major', label: '月章', filter: { kind: 'major' } },
  { key: 'minor', label: '星签', filter: { kind: 'minor' } },
  ...SUITS.map((s) => ({ key: `suit-${s.key}`, label: s.zh, filter: { kind: 'suit', suit: s.key } as Filter })),
  { key: 'owned', label: '已启封', filter: { kind: 'owned' } },
  { key: 'sealed', label: '封缄', filter: { kind: 'sealed' } },
];

export default function CollectionPage() {
  const collection = useGame((s) => s.collection);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });

  const owned = useMemo(() => new Set(Object.keys(collection)), [collection]);
  const total = ALL_CARDS.length;

  const cards = ALL_CARDS.filter((c) => {
    switch (filter.kind) {
      case 'all': return true;
      case 'major': return c.arcana === 'major';
      case 'minor': return c.arcana === 'minor';
      case 'suit': return c.arcana === 'minor' && c.suit === filter.suit;
      case 'owned': return owned.has(c.id);
      case 'sealed': return !owned.has(c.id);
    }
  });

  return (
    <div className="fade-in">
      <div className="panel-title">魔女阁 · 七十八封星之遗言</div>
      <p style={{ color: 'var(--text-mid)', fontSize: 13, margin: '4px 0 0' }}>
        已启封 <b style={{ color: 'var(--gold)' }}>{owned.size}</b> / {total} ——
        火漆未破的牌位，正在等它自己的时刻。
      </p>

      <div className="filters" role="group" aria-label="筛选牌组">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-btn${JSON.stringify(filter) === JSON.stringify(f.filter) ? ' active' : ''}`}
            onClick={() => setFilter(f.filter)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card-grid archive-wall">
        {cards.map((c) => {
          const isOwned = owned.has(c.id);
          const entry = collection[c.id];
          return (
            <Link
              key={c.id}
              to={`/card/${c.id}`}
              className={`card-btn${isOwned ? ' owned' : ''}`}
              aria-label={isOwned ? `${c.nameZh}（已启封）` : `${c.nameZh}（封缄）`}
              style={{ position: 'relative', display: 'block' }}
            >
              {isOwned ? (
                <CardArt card={c} style={{ width: '100%' }} />
              ) : (
                <SealedCard
                  arcana={c.arcana}
                  suit={c.arcana === 'minor' ? c.suit : undefined}
                  style={{ width: '100%', opacity: 0.92 }}
                />
              )}
              {entry && entry.count > 1 && (
                <span className="count-badge">×{entry.count}</span>
              )}
              <div className="card-name-line">
                {isOwned ? c.nameZh : '· 封缄 ·'}
              </div>
            </Link>
          );
        })}
      </div>

      {cards.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-low)', padding: '40px 0' }}>
          这个格子里还没有任何牌。
        </p>
      )}

      <p style={{ textAlign: 'center', marginTop: 26, fontSize: 12, color: 'var(--text-low)' }}>
        {isMajor(ALL_CARDS[0]) ? '月章稀有而庄重，星签轻盈而繁多 —— 每一封都只被完整收录一次。' : ''}
      </p>
    </div>
  );
}
