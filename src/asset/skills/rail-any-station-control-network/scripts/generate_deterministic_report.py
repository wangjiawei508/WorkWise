#!/usr/bin/env python3
import argparse, hashlib, json
VERSION="rail-any-station-control-network/1.0"
def main():
 ap=argparse.ArgumentParser(); ap.add_argument("facts"); ap.add_argument("output"); a=ap.parse_args()
 raw=open(a.facts,"rb").read(); data=json.loads(raw.decode("utf-8")); canonical=json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(",",":")); digest=hashlib.sha256(canonical.encode()).hexdigest()
 p=data.get("project",{}); r=data.get("adjustment_results",{}); t=data.get("tolerances",{}); refs=data.get("source_refs",[])
 def val(obj,key): return obj.get(key,"待复核") if isinstance(obj,dict) else "待复核"
 lines=[f"# {p.get('name','项目名称')} 轨道任意设站控制网平差成果质量检查报告", "", f"**生成器版本**：{VERSION}  ", f"**输入 SHA-256**：{digest}  ", f"**坐标系统**：{p.get('coordinate_system','待复核')}  ", f"**高程系统**：{p.get('height_system','待复核')}  ", f"**规范版本**：{p.get('standard_version','待复核')}", "", "## 1 平差成果概况", f"- 平面成果：{val(r,'plane_status')}", f"- 高程成果：{val(r,'elevation_status')}", "", "## 2 限差与质量检查", "| 检查项 | 实测值 | 限差 | 判定 |", "|---|---:|---:|---|"]
 for k in sorted(t): lines.append(f"| {k} | {val(r,k)} | {t[k]} | {val(r,k+'_status')} |")
 lines += ["", "## 3 异常与处置", "- " + ("；".join(map(str,data.get('exceptions',[]))) or "无锁定异常记录；仍需人工复核原始观测。"), "", "## 4 结论", "本报告仅解释锁定的平差成果，不重新计算或修改坐标、高程、闭合差和改正数。缺失证据项均标记为“待复核”。", "", "## 5 来源", *[f"- {x}" for x in refs]]
 open(a.output,"w",encoding="utf-8",newline="\n").write("\n".join(lines)+"\n"); print(a.output)
if __name__=="__main__": main()
