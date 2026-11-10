/** Guided fly-to destinations. Each resolves to a feature in the catalogue by key or exact name. */
export interface Preset {
  label: string
  /** Feature key ("zone/2") or exact feature name. */
  ref: string
  group: 'Arrive' | 'Colleges' | 'Landmarks' | 'Academic' | 'Outdoors'
  dist?: number
}

export const PRESETS: Preset[] = [
  { label: 'University MTR Station', ref: 'University Station (MTR East Rail Line)', group: 'Arrive', dist: 420 },
  { label: 'University Main Entrance', ref: 'University Main Entrance', group: 'Arrive', dist: 260 },
  { label: 'Central Campus', ref: 'zone/1', group: 'Colleges', dist: 700 },
  { label: 'Chung Chi College', ref: 'zone/2', group: 'Colleges', dist: 760 },
  { label: 'New Asia College', ref: 'zone/3', group: 'Colleges', dist: 520 },
  { label: 'United College', ref: 'zone/4', group: 'Colleges', dist: 520 },
  { label: 'Shaw College', ref: 'zone/5', group: 'Colleges', dist: 520 },
  { label: 'Morningside College', ref: 'zone/8', group: 'Colleges', dist: 360 },
  { label: 'S.H. Ho College', ref: 'zone/9', group: 'Colleges', dist: 360 },
  { label: 'C.W. Chu College', ref: 'zone/10', group: 'Colleges', dist: 360 },
  { label: 'Wu Yee Sun College', ref: 'zone/11', group: 'Colleges', dist: 360 },
  { label: 'Lee Woo Sing College', ref: 'zone/12', group: 'Colleges', dist: 360 },
  { label: 'University Library', ref: 'University Library', group: 'Landmarks', dist: 300 },
  { label: 'The University Mall', ref: 'The University Mall', group: 'Landmarks', dist: 340 },
  { label: 'The Beacon & Gate of Wisdom', ref: 'The Beacon', group: 'Landmarks', dist: 180 },
  { label: 'Chung Chi College Chapel', ref: 'Chung Chi College Chapel', group: 'Landmarks', dist: 260 },
  { label: 'New Asia Water Tower', ref: 'The Water Tower in New Asia College (The Gentleman Tower)', group: 'Landmarks', dist: 260 },
  { label: 'United College Water Tower', ref: 'The Water Tower in United College (The Lady Tower)', group: 'Landmarks', dist: 260 },
  { label: 'Pavilion of Harmony', ref: 'Pavilion of Harmony', group: 'Landmarks', dist: 220 },
  { label: 'Sir Run Run Shaw Hall', ref: 'Sir Run Run Shaw Hall', group: 'Academic', dist: 280 },
  { label: 'University Science Centre', ref: 'University Science Centre', group: 'Academic', dist: 340 },
  { label: 'Yasumoto International Academic Park', ref: 'Yasumoto International Academic Park', group: 'Academic', dist: 360 },
  { label: 'Lee Shau Kee Building', ref: 'Lee Shau Kee Building', group: 'Academic', dist: 320 },
  { label: 'Institute of Chinese Studies', ref: 'Institute of Chinese Studies', group: 'Academic', dist: 240 },
  { label: 'Lake Ad Excellentiam', ref: 'Lake Ad Excellentiam', group: 'Outdoors', dist: 300 },
  { label: 'University Sports Centre', ref: 'University Sports Centre', group: 'Outdoors', dist: 380 },
  { label: 'Lingnan Stadium', ref: 'Lingnan Stadium', group: 'Outdoors', dist: 340 },
  { label: 'Herbal Garden', ref: 'Herbal Garden', group: 'Outdoors', dist: 220 },
]
