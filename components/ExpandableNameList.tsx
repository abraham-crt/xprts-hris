'use client'

import { useState } from 'react'

export type NameListItem = {
  primary: string
  secondary?: string
  badge?: string
  badgeColor?: string
  dot?: 'green' | 'amber' | 'red'
}

export function ExpandableNameList({
  items,
  limit = 4,
  emptyText = 'None.',
}: {
  items: NameListItem[]
  limit?: number
  emptyText?: string
}) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{emptyText}</p>
  }

  const visible = expanded ? items : items.slice(0, limit)
  const extra = items.length - limit

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.dot && <span className={`dot-${item.dot}`} />}
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.primary}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {item.badge && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                  background: item.badgeColor ? `${item.badgeColor}22` : 'rgba(99,102,241,0.12)',
                  color: item.badgeColor ?? 'var(--accent)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {item.badge}
                </span>
              )}
              {item.secondary && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {item.secondary}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {items.length > limit && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--accent)', fontWeight: 500,
            marginTop: 8, padding: 0, display: 'block',
          }}
        >
          {expanded ? '↑ Show less' : `↓ Show ${extra} more`}
        </button>
      )}
    </div>
  )
}
