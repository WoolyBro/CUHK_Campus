/** Small original pixel-style icons (inline SVG, crisp edges). */
import type { ReactNode } from 'react'

const S = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false" shapeRendering="crispEdges" fill="currentColor">
    {children}
  </svg>
)
export const IconSearch = () => (
  <S>
    <path d="M3 2h6v1h1v1h1v5h-1v1h1v1h1v1h1v1h1v1h-2v-1h-1v-1h-1v-1H9v1H3v-1H2V9H1V4h1V3h1zm1 2v1H3v4h1v1h5V9h1V5H9V4z" />
  </S>
)
export const IconLayers = () => (
  <S>
    <path d="M2 3h12v3H2zm0 4h12v3H2zm0 4h12v3H2z" opacity=".95" />
  </S>
)
export const IconPin = () => (
  <S>
    <path d="M5 1h6v1h1v1h1v5h-1v2h-1v2h-1v2H9v1H7v-1H6v-2H5v-2H4V8H3V3h1V2h1zm1 3v3h4V4z" />
  </S>
)
export const IconInfo = () => (
  <S>
    <path d="M2 1h12v1h1v12h-1v1H2v-1H1V2h1zm5 2v2h2V3zm0 4v6h2V7z" />
  </S>
)
export const IconList = () => (
  <S>
    <path d="M1 2h2v2H1zm4 0h10v2H5zM1 7h2v2H1zm4 0h10v2H5zm-4 5h2v2H1zm4 0h10v2H5z" />
  </S>
)
export const IconClose = () => (
  <S>
    <path d="M2 3h2v1h1v1h1v1h1v1h2V6h1V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1h-1v-1H7v1H6v1H5v1H4v1H2v-2h1v-1h1v-1h1V7H4V6H3V5H2z" />
  </S>
)
export const IconHome = () => (
  <S>
    <path d="M7 1h2v1h1v1h1v1h1v1h1v1h1v2h-1v6H9v-4H7v4H3V8H2V6h1V5h1V4h1V3h1V2h1z" />
  </S>
)
export const IconNorth = () => (
  <S>
    <path d="M7 1h2v2h1v2h1v2h1v2h1v2h1v2h-3v-1H9v-1H7v1H5v1H2v-2h1V9h1V7h1V5h1V3h1z" />
  </S>
)
export const IconWalk = () => (
  <S>
    <path d="M7 1h3v3H7zM6 5h4v1h1v2h1v1h-2V8H9v3h1v2h1v2H9v-2H8v-1H7v3H5v-4h1V8H5v2H3V7h1V6h2z" />
  </S>
)
export const IconSun = () => (
  <S>
    <path d="M7 0h2v2H7zm0 14h2v2H7zM0 7h2v2H0zm14 0h2v2h-2zM2 2h2v2H2zm10 0h2v2h-2zM2 12h2v2H2zm10 0h2v2h-2zM5 4h6v1h1v6h-1v1H5v-1H4V5h1z" />
  </S>
)
export const IconMoon = () => (
  <S>
    <path d="M6 1h4v1H8v1H7v2H6v4h1v2h1v1h2v1h3v1h-1v1H6v-1H4v-1H3v-2H2V6h1V4h1V3h1V2h1z" />
  </S>
)
export const IconBolt = () => (
  <S>
    <path d="M8 1h4v2h-1v2h-1v1h3v2h-1v1h-1v1h-1v1H9v1H8v1H7v1H5v-2h1v-2h1V9H4V7h1V6h1V4h1V2h1z" />
  </S>
)
export const IconPlus = () => (
  <S>
    <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" />
  </S>
)
export const IconMinus = () => (
  <S>
    <path d="M2 6h12v4H2z" />
  </S>
)
export const IconFly = () => (
  <S>
    <path d="M1 7h3v1h2V4h1V2h2v2h1v4h2V7h3v2h-1v1h-3v1h-1v3H7v-3H6v-1H3V9H1z" />
  </S>
)
export const IconLink = () => (
  <S>
    <path d="M9 2h4v1h1v4h-1v1h-3V6h2V4H9zM3 8h3v2H4v2h3v2H3v-1H2V9h1zm2-3h6v2H5z" transform="rotate(0)" />
  </S>
)
