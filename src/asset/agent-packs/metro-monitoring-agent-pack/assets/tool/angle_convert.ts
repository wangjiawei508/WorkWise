/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

// ============================================================
// Angle format conversion utilities
// ============================================================

function dms2dec(degrees: number, minutes: number, seconds: number): number {
  const sign = degrees < 0 ? -1 : 1
  return sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600)
}

function dec2dms(decimal: number): { degrees: number; minutes: number; seconds: number } {
  const sign = decimal < 0 ? -1 : 1
  const abs = Math.abs(decimal)
  const d = Math.floor(abs)
  const mFull = (abs - d) * 60
  const m = Math.floor(mFull)
  const s = (mFull - m) * 60
  return { degrees: sign * d, minutes: m, seconds: Number(s.toFixed(4)) }
}

function dec2rad(decimal: number): number {
  return (decimal * Math.PI) / 180
}

function rad2dec(radians: number): number {
  return (radians * 180) / Math.PI
}

function dec2mil(decimal: number): number {
  // NATO mil: 6400 mils = 360°
  return (decimal * 6400) / 360
}

function mil2dec(mils: number): number {
  return (mils * 360) / 6400
}

function dec2gon(decimal: number): number {
  return (decimal * 400) / 360
}

function gon2dec(gon: number): number {
  return (gon * 360) / 400
}

// ============================================================
// Tool: DMS → Decimal Degrees
// ============================================================

export const dms_to_decimal = tool({
  description:
    "度分秒(DMS)转十进制度。全站仪读数、经纬仪照准读数等常以DMS格式记录，计算前需转换为十进制度。data_analyst 在处理原始观测数据时必须调用此工具而非口算。",
  args: {
    degrees: tool.schema.number().describe("度（整数部分），允许负值表示南纬或西经"),
    minutes: tool.schema.number().min(0).max(59).describe("分（0~59）"),
    seconds: tool.schema.number().min(0).describe("秒（0~59.9999），支持小数秒"),
  },
  async execute(args) {
    const decimal = dms2dec(args.degrees, args.minutes, args.seconds)
    return JSON.stringify({
      input: { degrees: args.degrees, minutes: args.minutes, seconds: args.seconds },
      decimal_degrees: Number(decimal.toFixed(8)),
      radians: Number(dec2rad(decimal).toFixed(10)),
      gon: Number(dec2gon(decimal).toFixed(6)),
      message: `✅ ${args.degrees}°${args.minutes}′${args.seconds}″ = ${decimal.toFixed(8)}°`,
    })
  },
})

// ============================================================
// Tool: Decimal Degrees → DMS
// ============================================================

export const decimal_to_dms = tool({
  description: "十进制度转度分秒(DMS)。将计算结果转换回DMS格式用于报告撰写、仪器设站或放样数据准备。",
  args: {
    decimal: tool.schema.number().describe("十进制角度值（度）"),
  },
  async execute(args) {
    const dms = dec2dms(args.decimal)
    return JSON.stringify({
      input_decimal: args.decimal,
      degrees: dms.degrees,
      minutes: dms.minutes,
      seconds: dms.seconds,
      formatted: `${dms.degrees}°${dms.minutes}′${dms.seconds}″`,
      message: `✅ ${args.decimal}° = ${dms.degrees}°${dms.minutes}′${dms.seconds}″`,
    })
  },
})

// ============================================================
// Tool: Multi-format angle conversion
// ============================================================

export const angle_convert = tool({
  description:
    "角度多格式互转：支持十进制度(DEG)、度分秒(DMS)、弧度(RAD)、密位(MIL/NATO 6400制)、百分度(GON/梯度)之间的任意互转。输入一种格式，返回所有其他格式的等效值。测量数据处理、坐标计算、放样准备时的角度单位转换必须调用此工具。",
  args: {
    value: tool.schema.number().describe("角度数值"),
    from: tool.schema
      .enum(["DEG", "DMS_packed", "RAD", "MIL", "GON"])
      .describe(
        "输入格式：DEG=十进制度, DMS_packed=紧凑DMS格式(如 123.4530 表示123°45′30″), RAD=弧度, MIL=密位(NATO 6400), GON=百分度/梯度",
      ),
  },
  async execute(args) {
    let decimal: number

    if (args.from === "DEG") {
      decimal = args.value
    } else if (args.from === "DMS_packed") {
      // Packed DMS: 123.4530 means 123°45'30"
      const sign = args.value < 0 ? -1 : 1
      const abs = Math.abs(args.value)
      const d = Math.floor(abs)
      const remain = (abs - d) * 100
      const m = Math.floor(remain)
      const s = (remain - m) * 100
      decimal = sign * (d + m / 60 + s / 3600)
    } else if (args.from === "RAD") {
      decimal = rad2dec(args.value)
    } else if (args.from === "MIL") {
      decimal = mil2dec(args.value)
    } else {
      decimal = gon2dec(args.value)
    }

    const dms = dec2dms(decimal)

    // Packed DMS reconstruction
    const packedDms =
      Number((Math.abs(dms.degrees) + dms.minutes / 100 + dms.seconds / 10000).toFixed(4)) * (decimal < 0 ? -1 : 1)

    return JSON.stringify({
      input: { value: args.value, format: args.from },
      results: {
        decimal_degrees: Number(decimal.toFixed(8)),
        dms: { degrees: dms.degrees, minutes: dms.minutes, seconds: dms.seconds },
        dms_formatted: `${dms.degrees}°${dms.minutes}′${dms.seconds}″`,
        dms_packed: Number(packedDms.toFixed(4)),
        radians: Number(dec2rad(decimal).toFixed(10)),
        mils_nato: Number(dec2mil(decimal).toFixed(4)),
        gon: Number(dec2gon(decimal).toFixed(6)),
      },
      message: `✅ ${args.value} ${args.from} = ${decimal.toFixed(8)}° = ${dms.degrees}°${dms.minutes}′${dms.seconds}″ = ${dec2rad(decimal).toFixed(10)} rad`,
    })
  },
})
