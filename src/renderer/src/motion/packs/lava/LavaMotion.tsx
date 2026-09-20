import type { CSSProperties } from 'react'

import type { MotionPackProps } from '../../types'
import './lava.css'

type LavaStyle = CSSProperties &
  Record<
    | '--motion-speed'
    | '--motion-brightness'
    | '--motion-density'
    | '--motion-turbulence'
    | '--lava-duration'
    | '--lava-opacity'
    | '--lava-saturation'
    | '--lava-secondary-scale'
    | '--lava-spread'
    | '--lava-travel-x'
    | '--lava-pulse-lo'
    | '--lava-pulse-mid'
    | '--lava-pulse-hi',
    number | string
  >

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))

function stateEnergy(state: MotionPackProps['state']): number {
  switch (String(state)) {
    case 'working':
    case 'thinking':
      return 1.12
    case 'waiting':
    case 'waiting_permission':
      return 0.84
    case 'error':
      return 0.94
    case 'completed':
      return 1.04
    default:
      return 0.72
  }
}

export function LavaMotion({ state, motion, reducedMotion }: MotionPackProps): React.JSX.Element {
  const speed = clamp(motion.speed)
  const brightness = clamp(motion.brightness)
  const density = clamp(motion.density)
  const turbulence = clamp(motion.turbulence)
  const energy = stateEnergy(state)

  // 크기 변화 진폭. turbulence/density가 registry.ts에서 이미 상태별로
  // 다르게 정의돼 있어, 별도 분기 없이 상태 차등이 따라온다.
  // 진폭은 ±22%에서 낮췄다 — 크게 부푸는 것 + 팽팽한 경계가 겹치면
  // 유체가 아니라 호흡하는 개체로 읽힌다 (docs/design-log.md 001).
  // reducedMotion이면 1로 고정 — paused는 음수 delay 위치의 프레임에서
  // 얼어붙기 때문에, 그냥 두면 축소된 크기로 멈출 수 있다.
  const pulse = clamp(0.1 + turbulence * 0.8 + density * 0.35)
  const pulseLo = reducedMotion ? 1 : 1 - pulse * 0.14
  const pulseMid = reducedMotion ? 1 : 1 - pulse * 0.03
  const pulseHi = reducedMotion ? 1 : 1 + pulse * 0.18

  const style: LavaStyle = {
    '--motion-speed': speed,
    '--motion-brightness': brightness,
    '--motion-density': density,
    '--motion-turbulence': turbulence,
    '--lava-duration': `${(24 - speed * 10) / energy}s`,
    '--lava-opacity': 0.9 + brightness * 0.1,
    // 작은 투명 창에서도 불빛이 흐려지지 않도록 기본 채도를 높인다.
    // 상태 간 진폭은 남겨
    // waiting_permission/error가 묻히지 않게 한다.
    '--lava-saturation': `${118 + brightness * 42}%`,
    '--lava-secondary-scale': 0.72 + density * 0.34,
    // 세로 이동을 키워 부력 사이클이 읽히게. 가로는 sway 레이어와 나눠 가진다.
    '--lava-spread': `${12 + turbulence * 14}px`,
    '--lava-travel-x': `${5 + turbulence * 11}px`,
    '--lava-pulse-lo': pulseLo,
    '--lava-pulse-mid': pulseMid,
    '--lava-pulse-hi': pulseHi,
  }

  return (
    <svg
      className={`lava-motion${reducedMotion ? ' lava-motion--reduced' : ''}`}
      data-state={String(state)}
      style={style}
      // Crop the source artwork to its animated bounds so the transparent
      // companion window stays close to the visible lava.
      viewBox="55 55 150 170"
      role="img"
      aria-label={`라바 모션, ${String(state)} 상태`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="lava-fill" x1="0.18" y1="0.08" x2="0.82" y2="0.94">
          <stop className="lava-motion__stop lava-motion__stop--warm" offset="0" />
          <stop className="lava-motion__stop lava-motion__stop--mid" offset="0.54" />
          <stop className="lava-motion__stop lava-motion__stop--deep" offset="1" />
        </linearGradient>
        <filter
          id="lava-metaball"
          x="-60%"
          y="-50%"
          width="220%"
          height="200%"
          colorInterpolationFilters="sRGB"
        >
          {/* 블러 결과의 알파 = "몇 겹 겹쳤나" = 두께. 아래 세 단계가
              같은 값을 각각 다른 임계값으로 읽는다. */}
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={6.4 + density * 2.2}
            result="soft-balls"
          />
          {/* 몸통. 방울이 반투명(0.5)이라 임계값도 그에 맞춰 0.30으로 맞췄다.
              기울기 9 — 실루엣이 무르게 빠져야 그 위에 얹힌 어두운 가장자리가
              선처럼 도드라지지 않는다. */}
          <feColorMatrix
            in="soft-balls"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 9 -2.2"
            result="joined-balls"
          />

          {/* 식은 가장자리. 흑체복사는 온도가 내려가면 밝기부터 잃는다 —
              노랑 → 주황 → 검붉음 → 거의 검정.
              기울기가 음수라 두꺼울수록 0에 가까워진다: 몸통 경계(0.30)에서
              최대, 0.685에서 소멸. 이 소멸 지점이 아래 코어의 시작(0.45)보다
              한참 안쪽이라 두 램프가 겹친다 — 겹쳐야 중간에 아무것도 적용되지
              않는 구간이 안 생기고, 어두운 부분이 띠(테두리)로 안 보인다. */}
          <feColorMatrix
            in="soft-balls"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 -2.6 1.78"
            result="rim-mask"
          />
          {/* 적용 면적이 넓어진 만큼 농도는 낮춘다.
              multiply로 곱하는 색이라 밝을수록 덜 어두워지고 채도는 살아난다. */}
          <feFlood floodColor="#ef2100" floodOpacity={0.43 - brightness * 0.1} result="rim-color" />
          <feComposite in="rim-color" in2="rim-mask" operator="in" result="rim-glow" />
          <feComposite in="rim-glow" in2="joined-balls" operator="in" result="rim-clipped" />
          <feBlend in="joined-balls" in2="rim-clipped" mode="multiply" result="cooled" />

          {/* 뜨거운 중심. 흰색이 아니라 밝은 노랑이어야 용암으로 읽힌다.
              screen은 채널별로 밝히기 때문에 flood의 파랑이 높으면 흰색이 된다
              (직전 #fff1c4는 B=196이라 하얗게 떴다). B=77로 낮춰 노랑을 지킨다.
              0.45부터 서서히 올라 0.77에서 최대. 시작점이 위 rim의 소멸점
              (0.685)보다 바깥이라 둘이 겹쳐서 이어진다. */}
          <feColorMatrix
            in="soft-balls"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 3.2 -1.45"
            result="core-mask"
          />
          <feFlood floodColor="#fff64d" floodOpacity={0.62 + brightness * 0.3} result="core-color" />
          <feComposite in="core-color" in2="core-mask" operator="in" result="core-glow" />
          {/* 몸통 밖으로 새지 않게 자른다 — 알파가 몸통을 넘지 않아 헤일로가 안 생긴다. */}
          <feComposite in="core-glow" in2="cooled" operator="in" result="core-clipped" />
          <feBlend in="cooled" in2="core-clipped" mode="screen" result="heated" />
        </filter>
      </defs>

      <g className="lava-motion__field" filter="url(#lava-metaball)" aria-hidden="true">
        {/* 세 옥타브: sway(느린 가로 대류) > orbit(부력) > blob(크기).
            주기가 서로 나누어떨어지지 않고, 느린 층일수록 진폭이 크다. */}
        <g className="lava-motion__sway lava-motion__sway--one">
          <g className="lava-motion__orbit lava-motion__orbit--one">
            <ellipse className="lava-motion__blob lava-motion__blob--one" cx="112" cy="174" rx="41" ry="37" />
          </g>
        </g>
        <g className="lava-motion__sway lava-motion__sway--two">
          <g className="lava-motion__orbit lava-motion__orbit--two">
            <ellipse className="lava-motion__blob lava-motion__blob--two" cx="146" cy="158" rx="33" ry="36" />
          </g>
        </g>
        <g className="lava-motion__sway lava-motion__sway--three">
          <g className="lava-motion__orbit lava-motion__orbit--three">
            <circle className="lava-motion__blob lava-motion__blob--three" cx="92" cy="148" r="29" />
          </g>
        </g>
        <g className="lava-motion__sway lava-motion__sway--four">
          <g className="lava-motion__orbit lava-motion__orbit--four">
            <ellipse className="lava-motion__blob lava-motion__blob--four" cx="144" cy="119" rx="25" ry="28" />
          </g>
        </g>
        <g className="lava-motion__sway lava-motion__sway--five">
          <g className="lava-motion__orbit lava-motion__orbit--five">
            {/* 5번은 원래 r=19에 위쪽으로 떨어져 있어 혼자 겉돌았고,
                작아서 블러 후 알파가 약해 목이 끊기기도 했다. 키우고 살짝 내렸다. */}
            <circle className="lava-motion__blob lava-motion__blob--five" cx="105" cy="115" r="24" />
          </g>
        </g>
      </g>

      <g className="lava-motion__sheen" aria-hidden="true">
        <ellipse cx="103" cy="166" rx="15" ry="23" />
        <ellipse cx="140" cy="148" rx="10" ry="16" />
      </g>
    </svg>
  )
}

export default LavaMotion
