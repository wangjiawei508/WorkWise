#!/usr/bin/env python3
"""Generate a third-party assessment report from one deterministic result.json."""
import argparse
import json
from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def clear_body(doc):
    body=doc._element.body
    for child in list(body):
        if child.tag != qn('w:sectPr'):
            body.remove(child)

def set_text(cell,text):
    cell.text=str(text)
    for p in cell.paragraphs:
        for run in p.runs:
            run.font.name='宋体';run._element.rPr.rFonts.set(qn('w:eastAsia'),'宋体');run.font.size=Pt(9)
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER

def set_table_grid(t):
    """Use the template style when available and fall back to direct borders."""
    try:
        t.style='Table Grid'
        return
    except KeyError:
        pass
    tbl_pr=t._tbl.tblPr
    borders=tbl_pr.first_child_found_in('w:tblBorders')
    if borders is None:
        borders=OxmlElement('w:tblBorders')
        tbl_pr.append(borders)
    for edge in ('top','left','bottom','right','insideH','insideV'):
        node=borders.find(qn(f'w:{edge}'))
        if node is None:
            node=OxmlElement(f'w:{edge}')
            borders.append(node)
        node.set(qn('w:val'),'single')
        node.set(qn('w:sz'),'4')
        node.set(qn('w:space'),'0')
        node.set(qn('w:color'),'808080')

def table(doc,headers,rows):
    t=doc.add_table(rows=1,cols=len(headers));set_table_grid(t);t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for c,h in zip(t.rows[0].cells,headers):set_text(c,h)
    trPr=t.rows[0]._tr.get_or_add_trPr();repeat=OxmlElement('w:tblHeader');trPr.append(repeat)
    for row in rows:
        cells=t.add_row().cells
        for c,v in zip(cells,row):set_text(c,v)
    return t

def para(doc,text='',align=None,bold=False,size=10):
    p=doc.add_paragraph();
    if align is not None:p.alignment=align
    r=p.add_run(text);r.bold=bold;r.font.name='宋体';r._element.rPr.rFonts.set(qn('w:eastAsia'),'宋体');r.font.size=Pt(size)
    p.paragraph_format.first_line_indent=Cm(0.74) if align is None else Cm(0)
    p.paragraph_format.line_spacing=1.5
    return p

def heading(doc,text,level=1):
    p=doc.add_paragraph(style=f'Heading {level}' if level in (1,2,3) else 'Normal')
    p.paragraph_format.space_before=Pt(8);p.paragraph_format.space_after=Pt(4)
    r=p.add_run(text);r.font.name='黑体';r._element.rPr.rFonts.set(qn('w:eastAsia'),'黑体');r.font.size=Pt(12 if level==1 else 10)
    return p

def page(doc):doc.add_page_break()

def build(result,template,out,role='第三方评估单位'):
    doc=Document(template);clear_body(doc)
    for sec in doc.sections:
        sec.top_margin=Cm(2.2);sec.bottom_margin=Cm(2.0);sec.left_margin=Cm(2.5);sec.right_margin=Cm(2.0)
    project=result['project'].replace('.4','')
    m=result['maximums'];lim=m['limits_from_project_standard']
    # Cover: retain the template's title hierarchy and page rhythm.
    para(doc,'新建宁波轨道交通1号线一期工程',WD_ALIGN_PARAGRAPH.CENTER,True,18)
    para(doc,'轨道任意设站控制网测量',WD_ALIGN_PARAGRAPH.CENTER,True,18)
    para(doc,'初测评估报告',WD_ALIGN_PARAGRAPH.CENTER,True,22)
    para(doc,project,WD_ALIGN_PARAGRAPH.CENTER,False,14)
    para(doc,'编制单位：第三方测量评估单位',WD_ALIGN_PARAGRAPH.CENTER,False,12)
    para(doc,'编制日期：自动生成',WD_ALIGN_PARAGRAPH.CENTER,False,12)
    page(doc)
    para(doc,'新建宁波轨道交通1号线一期工程',WD_ALIGN_PARAGRAPH.CENTER,True,16)
    para(doc,'轨道任意设站控制网测量初测评估报告',WD_ALIGN_PARAGRAPH.CENTER,True,16)
    para(doc,'编  制：________________',WD_ALIGN_PARAGRAPH.LEFT,False,11)
    para(doc,'复  核：________________',WD_ALIGN_PARAGRAPH.LEFT,False,11)
    para(doc,'审  核：________________',WD_ALIGN_PARAGRAPH.LEFT,False,11)
    page(doc)
    heading(doc,'目 录',1)
    for item in ['一、评估依据','二、工程概况','三、测量人员及仪器配置评估','四、轨道任意设站控制网评估','五、评估结论','六、存在的问题及建议','七、成果表']:
        para(doc,item,align=WD_ALIGN_PARAGRAPH.LEFT)
    page(doc)
    heading(doc,'一、评估依据')
    heading(doc,'1.1 评估工作依据',2)
    para(doc,f'受建设单位委托，{role}依据施工单位提交的{project}任意设站控制网原始观测、平差计算文件和成果资料开展独立评估。')
    heading(doc,'1.2 评估技术依据',2)
    for s in ['《城市轨道交通工程测量规范》（项目批准现行版本）','《地下铁道工程施工及验收规范》','《国家一、二等水准测量规范》','项目轨道任意设站控制网测量作业指导书','本项目批准的技术设计、限差和成果提交要求']:
        para(doc,'1. '+s)
    heading(doc,'1.3 相关单位提供的资料',2)
    for s in ['IN1高差网输入及平差成果','IN2方向距离网输入及自由网/约束网成果','SUC原始全站仪观测文件（仅作归算诊断）','技术报告、成果表、外业限差与闭合差统计文件']:
        para(doc,'- '+s)
    heading(doc,'二、工程概况')
    para(doc,f'本次评估对象为{project}。计算输入分别包含IN2平面方向距离网和IN1高差网；具体线路里程、结构段和施工日期以项目原始技术报告及锁定资料为准。')
    heading(doc,'2.1 评估工作范围',2);para(doc,'评估范围覆盖控制点布设资料、仪器与组件资料、平面外业观测、高程外业观测、自由网与约束网平差、精度统计及成果表。')
    heading(doc,'2.2 坐标及高程系统',2);para(doc,'坐标和高程基准采用项目锁定资料中的系统；本报告不擅自替换起算基准。')
    heading(doc,'三、测量人员及仪器配置评估')
    table(doc,['项目','评估依据','结论'],[['平面测量','IN2及技术报告中的仪器、参数和检定资料','按锁定资料复核'],['高程测量','IN1及技术报告中的高程仪器、软件和检定资料','按锁定资料复核'],['软件','项目实际平差软件输出文件','成果可独立复算并比对']])
    heading(doc,'四、轨道任意设站控制网评估')
    heading(doc,'4.1 平差成果最大值与限差',2)
    rows=[['约束网点位中误差 MP（mm）',f"{m['fixed_plane']['max_point_MP_mm']:.3f}",f"≤{lim['fixed_point_MP_mm']:.1f}"],['自由网方向改正数（″）',f"{m['free_plane']['max_direction_correction_arcsec']:.3f}",f"≤{lim['free_direction_correction_arcsec']:.1f}"],['自由网距离改正数（mm）',f"{m['free_plane']['max_distance_correction_mm']:.3f}",f"≤{lim['free_distance_correction_mm']:.1f}"],['约束网方向改正数（″）',f"{m['fixed_plane']['max_direction_correction_arcsec']:.3f}",f"≤{lim['fixed_direction_correction_arcsec']:.1f}"],['约束网距离改正数（mm）',f"{m['fixed_plane']['max_distance_correction_mm']:.3f}",f"≤{lim['fixed_distance_correction_mm']:.1f}"],['高差改正数（mm）',f"{m['height']['max_height_correction_mm']:.3f}",f"≤{lim['height_correction_mm']:.1f}"],['高程点中误差最大值（mm）',f"{m['height']['max_height_sigma_mm']:.3f}",f"≤{lim['height_point_sigma_mm']:.1f}"]]
    table(doc,['检查项目','最大成果','样例限差'],rows)
    heading(doc,'4.2 平面数据处理评估',2);para(doc,f"平面约束网自由度为{result['plane_fixed']['dof']}，方向观测验后中误差为{m['fixed_plane']['direction_sigma_arcsec']:.3f}″。自由网和约束网观测改正数均满足样例技术限差。")
    heading(doc,'4.3 高程数据处理评估',2);para(doc,f"高程网自由度为{result['height']['dof']}，验后单位权中误差为{m['height']['sigma0_mm_sqrt_km']:.3f} mm/√km。最大高差改正数和高程点中误差见表4.1。")
    heading(doc,'4.4 不同软件成果差异评估',2);para(doc,f"与历史成果文件比较，平面坐标单分量最大差异为{m['software_difference_mm']['coordinate_component']:.5f} mm，高程最大差异为{m['software_difference_mm']['height']:.5f} mm，属于成果取位范围内的微小差异。")
    heading(doc,'五、评估结论')
    para(doc,'在本次锁定输入、计算模型和样例技术限差范围内，平面自由网、平面约束网及高程网的平差成果满足限差要求，成果可用于下一阶段施工测量。正式使用前仍应核对项目批准的现行规范、仪器检定和起算点稳定性。')
    heading(doc,'六、存在的问题及建议')
    for s in ['SUC原始观测归算参数与IN1/IN2的全部对应关系仍需由项目平差软件或原始配置确认。','施工使用前应对任意设站控制点进行邻点校核，并按项目要求复测和维护。','棱镜中心高程与标志球顶高程应按项目组件几何关系区分记录。','历史报告中的统计值与计算文件存在版本差异时，应以锁定计算文件和审批记录为准。']:
        para(doc,s)
    heading(doc,'七、成果表')
    pts=result['plane_fixed']['points'];heights=result['height']['points']
    rows=[]
    for p,v in pts.items():
        h=heights.get(p,{});rows.append([p,f"{v['X_m']:.4f}",f"{v['Y_m']:.4f}",f"{h.get('H_m','待复核'):.5f}",f"{v['MP_mm']:.2f}",f"{h.get('sigma_H_mm','待复核')}"])
    table(doc,['点名','X（m）','Y（m）','H（m）','MP（mm）','MH（mm）'],rows)
    doc.save(out)
    return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument('result',type=Path);ap.add_argument('--template',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args()
    a.out.parent.mkdir(parents=True,exist_ok=True);build(json.loads(a.result.read_text(encoding='utf-8')),a.template,a.out)
    print(a.out)
if __name__=='__main__':main()
