import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import kunLogo from '../../../../asset/img/deepseek.svg'

export type IkunWorkLogoVariant = 'basketball' | 'chick' | 'player'

export const IKUN_WORK_LOGO_VARIANTS: readonly IkunWorkLogoVariant[] = [
  'basketball',
  'chick',
  'player'
]

export function pickIkunWorkLogoVariant(
  current?: IkunWorkLogoVariant
): IkunWorkLogoVariant {
  const candidates = IKUN_WORK_LOGO_VARIANTS.filter((variant) => variant !== current)
  const pool = candidates.length > 0 ? candidates : IKUN_WORK_LOGO_VARIANTS
  return pool[Math.floor(Math.random() * pool.length)] ?? 'basketball'
}

export function AnimatedWorkLogo({
  active = false,
  className = '',
  phase = 'lead',
  size = 'sm'
}: {
  active?: boolean
  className?: string
  phase?: 'lead' | 'trail'
  size?: 'sm' | 'md'
}): ReactElement {
  const [ikunVariant, setIkunVariant] = useState<IkunWorkLogoVariant>(() => pickIkunWorkLogoVariant())

  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => {
      setIkunVariant((current) => pickIkunWorkLogoVariant(current))
    }, 2800)
    return () => window.clearInterval(interval)
  }, [active])

  return (
    <span
      className={[
        'ds-work-logo',
        `ds-work-logo-${size}`,
        `ds-work-logo-phase-${phase}`,
        active ? 'is-active' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <span className="ds-work-logo-gust" />
      <span className="ds-work-logo-current" />
      <span className="ds-work-logo-swell" />
      <span className="ds-work-logo-wave ds-work-logo-wave-back" />
      <span className="ds-work-logo-ripple" />
      <span className="ds-work-logo-wave ds-work-logo-wave-front" />
      <span className="ds-work-logo-breaker" />
      <span className="ds-work-logo-wake" />
      <span className="ds-work-logo-foam" />
      <span className="ds-work-logo-crest" />
      <span className="ds-work-logo-splash" />
      <span className="ds-work-logo-spray" />
      <span className="ds-work-logo-bubbles" />
      <img className="ds-work-logo-echo" src={kunLogo} alt="" draggable={false} decoding="async" />
      <span className={`ds-ikun-logo ds-ikun-logo-${ikunVariant}`} data-ikun-variant={ikunVariant}>
        <span className="ds-ikun-logo-shadow" />
        <span className="ds-ikun-motif ds-ikun-motif-basketball">
          <span className="ds-ikun-basketball-ball">
            <span className="ds-ikun-basketball-seam is-vertical" />
            <span className="ds-ikun-basketball-seam is-horizontal" />
            <span className="ds-ikun-basketball-seam is-left" />
            <span className="ds-ikun-basketball-seam is-right" />
          </span>
        </span>
        <span className="ds-ikun-motif ds-ikun-motif-chick">
          <span className="ds-ikun-chick-body" />
          <span className="ds-ikun-chick-head">
            <span className="ds-ikun-chick-eye" />
            <span className="ds-ikun-chick-beak" />
          </span>
          <span className="ds-ikun-chick-wing" />
          <span className="ds-ikun-chick-foot is-left" />
          <span className="ds-ikun-chick-foot is-right" />
        </span>
        <span className="ds-ikun-motif ds-ikun-motif-player">
          <span className="ds-ikun-player-head" />
          <span className="ds-ikun-player-torso" />
          <span className="ds-ikun-player-arm is-left" />
          <span className="ds-ikun-player-arm is-right" />
          <span className="ds-ikun-player-leg is-left" />
          <span className="ds-ikun-player-leg is-right" />
          <span className="ds-ikun-player-ball" />
        </span>
      </span>
      <span className="ds-work-logo-track">
        <span className="ds-work-logo-body">
          <img className="ds-work-logo-image" src={kunLogo} alt="" draggable={false} decoding="async" />
          <img className="ds-work-logo-tail" src={kunLogo} alt="" draggable={false} decoding="async" />
        </span>
      </span>
    </span>
  )
}
