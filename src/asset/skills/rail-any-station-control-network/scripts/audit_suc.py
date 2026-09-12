"""Inspect SUC and compare a stated reduction model, without overwriting IN1/IN2."""
import math
import numpy as np
from network_adjustment import read_text, dms, ARC, parse_in1, parse_in2

def parse_suc(path):
    lines=read_text(path).splitlines()
    header=[v.strip() for v in lines[0].split(',')]
    station=header[0]; rounds=[]; current=None
    for line in lines[1:]:
        t=[v.strip() for v in line.split(',')]
        if not line.strip() or t[0] in ('Start','End'): continue
        if len(t)==1:
            current=[];rounds.append(current)
        elif len(t)==6 and current is not None:
            current.append((t[0],dms(t[1]),dms(t[2]),float(t[3])))
        else: raise ValueError(f'Unrecognized SUC record in {path}: {line}')
    if not rounds: raise ValueError('SUC has no rounds')
    return station,rounds

def reduce_suc(path):
    station,rounds=parse_suc(path)
    collected={}
    for rows in rounds:
        if len(rows)%2: raise ValueError('Unequal face observation counts')
        n=len(rows)//2
        left,right=rows[:n],rows[n:]
        if left[0][0]!=left[-1][0] or right[0][0]!=right[-1][0] or left[0][0]!=right[0][0]:
            raise ValueError('Missing closing direction')
        zero=left[0][0]
        for face_id,face in enumerate((left,right)):
            reference=float(np.mean(np.unwrap([face[0][1],face[-1][1]])))
            for pt in dict.fromkeys(o[0] for o in face):
                same=[o for o in face if o[0]==pt]
                c=collected.setdefault(pt,{'L':[],'Z':[],'S':[]})
                c['L'].append(0.0 if pt==zero else float(np.mean([(o[1]-reference)%(2*math.pi) for o in same])))
                c['Z'].extend([o[2] if face_id==0 else 2*math.pi-o[2] for o in same])
                c['S'].extend([o[3] for o in same])
    result={}
    for pt,c in collected.items():
        s=float(np.mean(c['S']));z=float(np.mean(c['Z']))
        result[pt]={'L':float(np.mean(c['L'])),'S':s*math.sin(z),'h_uncorrected_m':s*math.cos(z)}
    return station,result

def audit(project,in1,in2):
    _,_,obs=parse_in2(in2);_,heights=parse_in1(in1)
    found={};errors=[]
    for path in sorted((project/'工程项目/原始数据').glob('*.suc')):
        try:
            station,values=reduce_suc(path)
            if station in found: raise ValueError('Duplicate raw station; selection policy required')
            found[station]=values
        except ValueError as exc: errors.append({'file':path.name,'error':str(exc)})
    comparisons=[]
    for s,p,k,v in obs:
        if s not in found or p not in found[s]:
            comparisons.append({'station':s,'point':p,'type':k,'missing':True});continue
        computed=found[s][p][k]
        delta=(computed-v)*1000 if k=='S' else math.atan2(math.sin(computed-v),math.cos(computed-v))*ARC
        comparisons.append({'station':s,'point':p,'type':k,'difference':delta,'unit':'mm' if k=='S' else 'arcsec'})
    hchecks=[]
    for s,p,h,_ in heights:
        if s in found and p in found[s]:
            c=found[s][p]
            hchecks.append({'station':s,'point':p,'uncorrected_minus_in1_mm':(c['h_uncorrected_m']-h)*1000})
    return {'status':'DIAGNOSTIC_ONLY','method':'face mean, mean closing direction, mean slope distance and zenith angle; no second atmosphere correction',
            'note':'SUC does not by itself identify every historical correction and rounding parameter. Uncorrected height comparison is not an adjustment input.',
            'errors':errors,'plane_reduction':comparisons,'height_reduction':hchecks}
