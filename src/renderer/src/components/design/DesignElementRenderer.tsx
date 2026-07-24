import type { ReactElement, ReactNode } from 'react'
import { formatSvgColor, type DesignElement } from '@shared/design-document'

/**
 * 把单个 DesignElement 渲染为对应的 SVG 子节点。
 *
 * 这是画布渲染的核心——每种元素类型映射到一个 SVG 标签：
 *   rect → <rect>
 *   ellipse → <ellipse>
 *   line → <line>（用 x1/y1/x2/y2 从 x/y/w/h 计算）
 *   path → <path d>
 *   text → <text>
 *   image → <image>（资源尚未加载时显示安全占位）
 *   preset → 由 presetPaths/pathData 渲染，缺少几何时显示标记占位
 *   group → 透明结构边界；子元素按各自 zIndex 独立渲染
 *
 * 颜色渲染：数据模型存无 # 的 hex（如 '1E3A5F'），
 * 通过 formatSvgColor() 补 # 输出（如 '#1E3A5F'），符合 SVG 规范。
 * ✅ 已核实 parse_svg_color (utils.py:1650) 和 example SVG 都用带 # 格式。
 *
 * 旋转：用 SVG transform="rotate(deg, cx, cy)"，cx/cy 为元素中心。
 */
export function DesignElementRenderer({
  element,
  assetDataUrl
}: {
  element: DesignElement
  assetDataUrl?: string
}): ReactNode {
  // hidden 元素不渲染
  if (element.hidden) return null

  const fill = formatSvgColor(element.fill)
  const stroke = formatSvgColor(element.stroke)
  const strokeWidth = element.strokeWidth
  const strokeLinecap = element.strokeLinecap
  const strokeLinejoin = element.strokeLinejoin
  const opacity = element.opacity

  // 通用样式属性（全 inline，符合 svg_quality_checker 约束）
  const styleProps = {
    ...(fill !== undefined ? { fill } : { fill: 'none' }),
    ...(stroke !== undefined ? { stroke } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    ...(strokeLinecap !== undefined ? { strokeLinecap } : {}),
    ...(strokeLinejoin !== undefined ? { strokeLinejoin } : {}),
    ...(opacity !== undefined ? { opacity } : {})
  }

  // 旋转 transform（以元素中心为锚点）
  const transform = element.rotation !== 0
    ? `rotate(${element.rotation} ${element.x + element.w / 2} ${element.y + element.h / 2})`
    : undefined

  switch (element.type) {
    case 'rect':
      return (
        <rect
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          {...styleProps}
          {...(transform ? { transform } : {})}
        />
      )

    case 'ellipse':
      return (
        <ellipse
          cx={element.x + element.w / 2}
          cy={element.y + element.h / 2}
          rx={element.w / 2}
          ry={element.h / 2}
          {...styleProps}
          {...(transform ? { transform } : {})}
        />
      )

    case 'line':
      return (
        <line
          x1={element.x}
          y1={element.y}
          x2={element.x + element.w}
          y2={element.y + element.h}
          {...styleProps}
          fill="none"
          {...(transform ? { transform } : {})}
        />
      )

    case 'path':
      return (
        <path
          d={element.pathData ?? `M${element.x},${element.y} L${element.x + element.w},${element.y + element.h}`}
          {...styleProps}
          {...(transform ? { transform } : {})}
        />
      )

    case 'text': {
      const textX = element.textAlign === 'center'
        ? element.x + element.w / 2
        : element.textAlign === 'right'
          ? element.x + element.w
          : element.x
      return (
        <text
          x={textX}
          y={element.y + (element.fontSize ?? 24)}
          fontSize={element.fontSize ?? 24}
          fontFamily={element.fontFamily ?? "system-ui, 'Microsoft YaHei', sans-serif"}
          fontWeight={element.fontWeight ?? 'normal'}
          textAnchor={textAnchorForAlign(element.textAlign)}
          {...styleProps}
          {...(transform ? { transform } : {})}
        >
          {element.text ?? ''}
        </text>
      )
    }

    case 'image':
      return assetDataUrl ? (
        <image
          href={assetDataUrl}
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          preserveAspectRatio="xMidYMid meet"
          {...(opacity !== undefined ? { opacity } : {})}
          {...(transform ? { transform } : {})}
        />
      ) : (
        <rect
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          fill="#F3F4F6"
          stroke="#CBD5E1"
          strokeWidth={1}
          {...(transform ? { transform } : {})}
        />
      )

    case 'preset':
      if (element.presetPaths?.length || element.pathData) {
        const presetPaths = element.presetPaths?.length
          ? element.presetPaths
          : [{ d: element.pathData ?? '', fill: element.fill }]
        return (
          <g {...(transform ? { transform } : {})}>
            <g transform={`translate(${element.x} ${element.y}) scale(${element.w / 200} ${element.h / 150})`}>
              {presetPaths.map((path, index) => (
                <path
                  key={`${element.id}-path-${index}`}
                  d={path.d}
                  {...styleProps}
                  fill={path.fill === null ? 'none' : formatSvgColor(path.fill) ?? styleProps.fill}
                  stroke={path.stroke === null ? 'none' : formatSvgColor(path.stroke) ?? styleProps.stroke}
                  {...(path.strokeWidth !== undefined ? { strokeWidth: path.strokeWidth } : {})}
                  {...(path.opacity !== undefined ? { opacity: path.opacity } : {})}
                />
              ))}
            </g>
          </g>
        )
      }
      return (
        <g {...(transform ? { transform } : {})}>
          <rect
            x={element.x}
            y={element.y}
            width={element.w}
            height={element.h}
            rx={8}
            ry={8}
            {...styleProps}
          />
          <text
            x={element.x + element.w / 2}
            y={element.y + element.h / 2}
            fontSize={11}
            fontFamily="sans-serif"
            fill="#999999"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {element.presetName ?? 'preset'}
          </text>
        </g>
      )

    case 'group':
      // 子元素仍按自身 zIndex 渲染；透明边界只负责让结构分组可被点击选中。
      return (
        <rect
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          fill="transparent"
          stroke="none"
          {...(transform ? { transform } : {})}
        />
      )

    default:
      return null
  }
}

/** textAlign 内部值 → SVG textAnchor 属性 */
function textAnchorForAlign(align: DesignElement['textAlign']): 'start' | 'middle' | 'end' {
  switch (align) {
    case 'center':
      return 'middle'
    case 'right':
      return 'end'
    case 'left':
    default:
      return 'start'
  }
}
