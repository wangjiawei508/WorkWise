/**
 * Design 画布旋转手柄逻辑。
 *
 * 旋转手柄位于选中元素正上方（北方向），拖拽时计算鼠标位置
 * 相对元素中心的角度，更新 element.rotation。
 *
 * 角度系统：
 * - 0 度 = 正上方（手柄初始位置）
 * - 正数 = 顺时针（与 SVG/CSS transform: rotate() 一致）
 * - 范围 -180 ~ 180（atan2 返回范围），取整后存储
 *
 * Shift 键约束：按住 Shift 时吸附到 15 度整数倍（业界标准）。
 */

/** Shift 约束的角度步进（度） */
export const ROTATION_SNAP_STEP = 15

/**
 * 计算旋转角度。
 *
 * @param centerX 元素中心 X（SVG 坐标）
 * @param centerY 元素中心 Y（SVG 坐标）
 * @param mouseX 鼠标 X（SVG 坐标）
 * @param mouseY 鼠标 Y（SVG 坐标）
 * @param snapToStep 是否吸附到 15 度步进（Shift 键）
 * @returns 旋转角度（度，-180~180，取整）
 */
export function computeRotation(
  centerX: number,
  centerY: number,
  mouseX: number,
  mouseY: number,
  snapToStep = false
): number {
  // atan2 返回弧度，范围 -PI ~ PI
  // 手柄在正上方时鼠标角度应 = 0 度
  // atan2(dx, -dy) 让正上方 = 0，顺时针为正
  const dx = mouseX - centerX
  const dy = mouseY - centerY
  const radians = Math.atan2(dx, -dy)
  let degrees = (radians * 180) / Math.PI

  // 规范到 -180 ~ 180
  while (degrees > 180) degrees -= 360
  while (degrees < -180) degrees += 360

  if (snapToStep) {
    degrees = Math.round(degrees / ROTATION_SNAP_STEP) * ROTATION_SNAP_STEP
  }

  return Math.round(degrees)
}

/**
 * 获取旋转手柄的位置（SVG 坐标）。
 * 手柄在元素上方 ROTATION_HANDLE_OFFSET 像素处。
 *
 * 注意：这里返回的是"未旋转"状态下的位置。
 * 渲染时手柄应跟随元素的 rotation（在外层 g 的 transform 里处理）。
 */
export const ROTATION_HANDLE_OFFSET = 24

export function rotationHandlePosition(bounds: {
  x: number
  y: number
  w: number
  h: number
}): { x: number; y: number } {
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y - ROTATION_HANDLE_OFFSET
  }
}
