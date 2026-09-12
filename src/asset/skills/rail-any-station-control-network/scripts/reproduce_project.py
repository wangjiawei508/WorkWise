#!/usr/bin/env python3
"""Recompute IN1/IN2, then separately compare historical results and export reports."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from network_adjustment import read_text, height_adjust, plane_adjust, parse_in2

VERSION = '2.0.0'

def dump(path, obj):
    path.write_text(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False)+'\n',encoding='utf-8')

def unique(directory, pattern):
    paths=list(directory.glob(pattern))
    if len(paths)!=1:
        raise ValueError(f'Expected exactly one {pattern} in {directory}, got {len(paths)}')
    return paths[0]

def reference_plane(path):
    result={}
    for line in read_text(path).splitlines():
        t=line.split()
        if len(t)>=4 and t[0].isdigit():
            result[t[1]]={'X_m':float(t[2]),'Y_m':float(t[3])}
            if len(t)>=7:
                result[t[1]].update(dict(zip(('MX_mm','MY_mm','MP_mm'),map(float,t[4:7]))))
    if not result: raise ValueError('Empty reference plane results')
    return result

def reference_height(path):
    result={}
    for line in read_text(path).splitlines():
        t=[v.strip() for v in line.split(',')]
        if len(t)>=3 and t[0].isdigit():
            result[t[1]]={'H_m':float(t[2])}
            if len(t)>3 and t[3]: result[t[1]]['sigma_H_mm']=float(t[3])
    if not result: raise ValueError('Empty reference height results')
    return result

def compare_points(computed,expected):
    checks=[]
    if computed.keys()!=expected.keys():
        raise ValueError('Computed/reference point IDs differ')
    for p,fields in expected.items():
        for k,value in fields.items():
            step=0.00001 if k=='H_m' else 0.0001 if k in ('X_m','Y_m') else 0.01
            delta=computed[p][k]-value
            checks.append({'point':p,'field':k,'computed':computed[p][k],'reference':value,
                           'difference':delta,'half_last_digit':step/2,
                           'match':abs(delta)<=step/2+1e-9})
    return checks

def reference_residuals(path,free):
    mode=None; rows=[]
    for line in read_text(path).splitlines():
        if '方向平差结果' in line: mode='L'
        elif '距离平差结果' in line: mode='S'
        elif '平差坐标' in line or '坐标成果' in line: mode=None
        t=line.split()
        if mode and len(t)>=7 and t[0].isdigit():
            rows.append({'from':t[1],'to':t[2],'type':mode,'v':float(t[4 if free else 5])})
    return rows

def compare_residuals(computed,expected):
    if len(computed)!=len(expected): raise ValueError('Residual counts differ')
    result=[]
    # The solver preserves interleaved L/S order; legacy reports group by type.
    index={(r['from'],r['to'],r['type']):r for r in computed}
    for e in expected:
        key=(e['from'],e['to'],e['type'])
        d=index[key]['v']-e['v']
        result.append({**e,'difference':d,'match':abs(d)<=0.005+1e-7})
    return result

def raw_inventory(project,stations):
    files=[]
    for f in sorted((project/'工程项目/原始数据').glob('*.suc')):
        lines=read_text(f).splitlines()
        t=lines[0].split(',')
        files.append({'file':str(f.relative_to(project)),'station':t[0].strip(),
                      'header':t,'start':next((s for s in lines if s.startswith('Start,')),None),
                      'used_in_in2':t[0].strip() in stations})
    return files

def run(project,out,role='survey'):
    if role not in ('survey','assessment'):
        raise ValueError('role must be survey or assessment')
    folder=project/'工程项目/计算文件'
    in1=unique(folder,'*.in1'); in2=unique(folder,'*.in2')
    # Crucial boundary: solve before reading any historical result.
    height=height_adjust(in1)
    free=plane_adjust(in2,free=True)
    fixed=plane_adjust(in2)
    header,known,observations=parse_in2(in2)
    stations=list(dict.fromkeys(o[0] for o in observations))
    point_checks=compare_points(fixed['points'],reference_plane(unique(folder,'*f.cor')))
    height_checks=compare_points(height['points'],reference_height(unique(folder,'*.our')))
    fixed_res=compare_residuals(fixed['residuals'],reference_residuals(unique(folder,'*f.ou2'),False))
    free_res=compare_residuals(free['residuals'],reference_residuals(unique(folder,'*Z.ou2'),True))
    manifest=[{'path':str(f.relative_to(project)),'bytes':f.stat().st_size,
               'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(project.rglob('*')) if f.is_file() and f.name!='.DS_Store']
    result={'version':VERSION,'project':project.name,'plane_fixed':fixed,'plane_free':free,'height':height,
            'input_header':header,'sources':manifest,'raw_inventory':raw_inventory(project,stations),
            'comparison':{'coordinates_and_precision':point_checks,'heights_and_precision':height_checks,
                          'fixed_residuals':fixed_res,'free_residuals':free_res},
            'maximums':{
                'software_difference_mm':{
                    'coordinate_component':max((abs(r['difference']) for r in point_checks if r['field'] in ('X_m','Y_m')),default=0)*1000,
                    'height':max((abs(r['difference']) for r in height_checks if r['field']=='H_m'),default=0)*1000,
                    'point_precision':max((abs(r['difference']) for r in point_checks if r['field']=='MP_mm'),default=0)},
                'fixed_plane':{
                    'max_point_MP_mm':max((v['MP_mm'] for v in fixed['points'].values()),default=0),
                    'max_direction_correction_arcsec':max((abs(v['v']) for v in fixed['residuals'] if v['type']=='L'),default=0),
                    'max_distance_correction_mm':max((abs(v['v']) for v in fixed['residuals'] if v['type']=='S'),default=0),
                    'direction_sigma_arcsec':fixed['sigma_direction_arcsec']},
                'free_plane':{
                    'max_point_MP_mm':max((v['MP_mm'] for v in free['points'].values()),default=0),
                    'max_direction_correction_arcsec':max((abs(v['v']) for v in free['residuals'] if v['type']=='L'),default=0),
                    'max_distance_correction_mm':max((abs(v['v']) for v in free['residuals'] if v['type']=='S'),default=0),
                    'direction_sigma_arcsec':free['sigma_direction_arcsec']},
                'height':{
                    'max_height_sigma_mm':max((v['sigma_H_mm'] for v in height['points'].values()),default=0),
                    'max_height_correction_mm':max((abs(v['v_mm']) for v in height['residuals']),default=0),
                    'sigma0_mm_sqrt_km':height['sigma0_mm_sqrt_km']},
                'limits_from_project_standard':{
                    'free_direction_correction_arcsec':3.0,'free_distance_correction_mm':2.0,
                    'fixed_direction_correction_arcsec':3.0,'fixed_distance_correction_mm':2.0,
                    'fixed_point_MP_mm':3.0,'height_correction_mm':1.0,
                    'height_observation_sigma_mm':0.5,'height_point_sigma_mm':2.0,
                    'adjacent_height_sigma_mm':0.5}},
            'limitations':['本次独立复算入口是归算后的 IN1/IN2；SUC 归算尚未通过逐条一致性验证。',
                           '自由网坐标采用内约束基准，未复刻历史软件的公共点转换及其协方差表达。',
                           '数字匹配按历史输出末位的半个单位判定，不等于完整历史 DOC 字节一致或工程验收合格。',
                           '三角高程 IN3、粗差定位修复和区段接边尚未复现，不得自动切换替代本样例 IN1。']}
    from audit_suc import audit
    result['raw_reduction_audit']=audit(project,in1,in2)
    out.mkdir(parents=True,exist_ok=True)
    dump(out/'result.json',result)
    from report_outputs import export_reports
    export_reports(result,out)
    if role == 'assessment':
        from assessment_report import build
        template=Path(__file__).resolve().parents[1]/'assets/templates/轨道基础控制网初测评估报告-模板.docx'
        build(result,template,out/'评估报告.docx',role='第三方测量评估单位')
    else:
        import shutil
        shutil.copyfile(out/'report.docx',out/'成果报告.docx')
        # Measurement-unit delivery has three mandatory parts.
        engineering=out/'01-工程测量';results_dir=out/'02-测量成果';technical=out/'03-技术报告'
        engineering.mkdir(exist_ok=True);results_dir.mkdir(exist_ok=True);technical.mkdir(exist_ok=True)
        (engineering/'原始测量资料清单.json').write_text(json.dumps({'raw_inventory':result['raw_inventory'],'sources':result['sources']},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        (engineering/'工程测量作业说明.md').write_text('# 工程测量\n\n本部分记录原始观测文件、测站、仪器与输入资料清单；原始文件不在本输出目录中改写。\n',encoding='utf-8')
        shutil.copyfile(out/'results.xlsx',results_dir/'测量成果表.xlsx');shutil.copyfile(out/'network.png',results_dir/'控制网示意图.png')
        (results_dir/'平差成果.json').write_text(json.dumps({'plane_fixed':result['plane_fixed'],'plane_free':result['plane_free'],'height':result['height'],'maximums':result['maximums']},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        shutil.copyfile(out/'report.docx',technical/'技术报告.docx');shutil.copyfile(out/'report.md',technical/'技术报告.md')
        (out/'交付清单.json').write_text(json.dumps({'工程测量':[str(p.relative_to(out)) for p in engineering.iterdir()], '测量成果':[str(p.relative_to(out)) for p in results_dir.iterdir()], '技术报告':[str(p.relative_to(out)) for p in technical.iterdir()]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    total=sum(len(v) for v in result['comparison'].values())
    failed=sum(not row['match'] for v in result['comparison'].values() for row in v)
    summary={'project':project.name,'role':role,'report_type':'评估报告' if role=='assessment' else '工程测量+测量成果+技术报告','checks':total,'mismatches':failed,
             'plane_dof':fixed['dof'],'height_dof':height['dof'],
             'scope':'IN1/IN2 recomputation; not full SUC-to-legacy-report reproduction'}
    dump(out/'summary.json',summary)
    return summary

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('project',type=Path); p.add_argument('--out',type=Path,required=True);p.add_argument('--role',choices=['survey','assessment'],default='survey',help='survey=测量单位成果报告; assessment=第三方评估单位评估报告')
    a=p.parse_args()
    if a.project.resolve()==a.out.resolve() or a.project.resolve() in a.out.resolve().parents:
        p.error('Output must be outside source project')
    print(json.dumps(run(a.project,a.out,a.role),ensure_ascii=False,indent=2))

if __name__=='__main__': main()
