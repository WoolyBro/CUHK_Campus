/** Feature search: English / Chinese names, official codes, colleges, landmarks, roads, stops. */
import type { FeatureRecord, ZoneInfo } from '../../lib/voxel/world-format'

export interface SearchHit {
  feature: FeatureRecord
  score: number
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9㐀-鿿]+/g, ' ')
    .trim()

interface Entry {
  f: FeatureRecord
  name: string
  zh: string
  codes: string[]
  extra: string
}

export class SearchIndex {
  private entries: Entry[]
  constructor(features: FeatureRecord[], zones: ZoneInfo[]) {
    const zoneName = new Map(zones.map((z) => [z.id, `${z.nameEn} ${z.nameZh}`]))
    this.entries = features
      .filter((f) => f.rank >= 10)
      .map((f) => ({
        f,
        name: fold(f.name),
        zh: (f.nameZh ?? '').replace(/\s+/g, ''),
        codes: [f.code, f.short].filter((x): x is string => !!x).map((c) => c.toLowerCase().replace(/\s+/g, '')),
        extra: fold([...(f.alt ?? []), f.category, zoneName.get(f.zone) ?? ''].join(' ')) + ' ' + (f.alt ?? []).join(' '),
      }))
  }

  search(query: string, limit = 12): SearchHit[] {
    const raw = query.trim()
    if (!raw) return []
    const q = fold(raw)
    const qCode = raw.toLowerCase().replace(/\s+/g, '')
    const tokens = q.split(' ').filter(Boolean)
    const hits: SearchHit[] = []
    for (const e of this.entries) {
      let score = 0
      if (e.codes.includes(qCode)) score = 1000
      else if (q && e.name === q) score = 900
      else if (raw.length >= 1 && e.zh && e.zh === raw) score = 900
      else if (q && e.name.startsWith(q)) score = 700
      else if (e.codes.some((c) => c.startsWith(qCode)) && qCode.length >= 2) score = 650
      else if (q && e.name.split(' ').some((w) => w.startsWith(q))) score = 600
      else if (q && e.name.includes(q)) score = 500
      else if (/[㐀-鿿]/.test(raw) && (e.zh.includes(raw) || e.extra.includes(raw))) score = 520
      else if (tokens.length > 1 && tokens.every((t) => e.name.includes(t) || e.extra.includes(t))) score = 420
      else if (q.length >= 3 && e.extra.includes(q)) score = 300
      if (score) hits.push({ feature: e.f, score: score + e.f.rank })
    }
    hits.sort((a, b) => b.score - a.score || a.feature.name.localeCompare(b.feature.name))
    return hits.slice(0, limit)
  }
}
