"""Numerical candidate for legacy IN1/IN2 networks. No reference outputs are read."""
from pathlib import Path
from decimal import Decimal
import math
import numpy as np

ARC = 180 * 3600 / math.pi

def read_text(path):
    raw = Path(path).read_bytes()
    for enc in ('utf-8-sig', 'gb18030'):
        try:
            return raw.decode(enc)
        except UnicodeError:
            pass
    raise ValueError(f'Unsupported encoding: {path}')

def dms(value):
    v = abs(Decimal(str(value)))
    degree = int(v)
    mmss = (v - degree) * 100
    minute = int(mmss)
    second = (mmss - minute) * 100
    if minute >= 60 or second >= 60:
        raise ValueError(f'Invalid packed DMS: {value}')
    return math.copysign(math.radians(degree + minute / 60 + float(second) / 3600), float(value))

def parse_in1(path):
    fixed, obs = {}, []
    for n, line in enumerate(read_text(path).splitlines(), 1):
        t = [v.strip() for v in line.split(',')]
        if not line.strip():
            continue
        if len(t) == 2:
            if t[0] in fixed or not math.isfinite(float(t[1])):
                raise ValueError(f'Duplicate/nonfinite fixed height at line {n}')
            fixed[t[0]] = float(t[1])
        elif len(t) == 4:
            h, length = float(t[2]), float(t[3])
            if not math.isfinite(h) or not math.isfinite(length) or length <= 0:
                raise ValueError(f'Invalid observation line {n}')
            obs.append((t[0], t[1], h, length))
        else:
            raise ValueError(f'IN1 line {n}: expected 2 or 4 fields')
    if not fixed or not obs: raise ValueError('Empty height network')
    return fixed, obs

def height_adjust(path):
    fixed, obs = parse_in1(path)
    names = list(dict.fromkeys(p for o in obs for p in o[:2] if p not in fixed))
    idx = {p:i for i,p in enumerate(names)}
    A = np.zeros((len(obs), len(names)))
    l = np.zeros(len(obs))
    lengths = np.array([o[3] for o in obs])
    for i,(a,b,h,_) in enumerate(obs):
        l[i] = h
        for p, sign in ((a,-1),(b,1)):
            if p in idx:
                A[i,idx[p]] = sign
            else:
                l[i] -= sign * fixed[p]
    B = A / np.sqrt(lengths[:,None])
    x, _, rank, _ = np.linalg.lstsq(B, l / np.sqrt(lengths), rcond=None)
    if rank != len(names) or len(obs) <= rank:
        raise ValueError('Height network is disconnected, unanchored or has no redundancy')
    v = A @ x - l
    f = int(len(obs) - rank)
    pvv = float(np.sum(v*v / lengths) * 1e6)
    sigma0 = math.sqrt(pvv / f)
    Q = np.linalg.solve(B.T @ B, np.eye(len(names)))
    cov = Q * (sigma0/1000)**2
    points = {p:{'H_m':h,'sigma_H_mm':0.0} for p,h in fixed.items()}
    points.update({p:{'H_m':float(x[i]),'sigma_H_mm':float(np.sqrt(cov[i,i])*1000)} for i,p in enumerate(names)})
    return {'model':'IN1 fixed height; P=1/L_km', 'points':points, 'observations':len(obs),
            'unknowns':len(names),'dof':f,'pvv_mm2_per_km':pvv,'sigma0_mm_sqrt_km':sigma0,
            'residuals':[{'from':a,'to':b,'v_mm':float(v[i]*1000)} for i,(a,b,*_) in enumerate(obs)]}

def parse_in2(path):
    fixed, obs, station, header = {}, [], None, None
    for n,line in enumerate(read_text(path).splitlines(),1):
        if not line.strip():
            continue
        t = [v.strip() for v in line.split(',')]
        if header is None:
            header = tuple(map(float,t))
            if len(header)!=3 or not all(math.isfinite(v) for v in header) or min(header)<=0:
                raise ValueError('IN2 invalid precision header')
        elif len(t)==1:
            station=t[0]
        elif len(t)==3 and t[1] in ('L','S'):
            if not station:
                raise ValueError(f'Observation before station: {n}')
            obs.append((station,t[0],t[1],dms(t[2]) if t[1]=='L' else float(t[2])))
            if not math.isfinite(obs[-1][3]) or (t[1]=='S' and obs[-1][3]<=0) or station==t[0]:
                raise ValueError(f'Invalid observation: line {n}')
        elif len(t)==3 and station is None:
            values=np.array(list(map(float,t[1:])))
            if t[0] in fixed or not np.all(np.isfinite(values)):
                raise ValueError(f'Duplicate/nonfinite fixed point: line {n}')
            fixed[t[0]] = values
        else:
            raise ValueError(f'IN2 unrecognized line {n}')
    if len({o[:3] for o in obs})!=len(obs): raise ValueError('Repeated station/target/type; aggregate groups explicitly')
    if not obs: raise ValueError('Empty plane network')
    return header,fixed,obs

def initial_coordinates(fixed,obs):
    local={}
    for s,p,k,v in obs:
        local.setdefault(s,{}).setdefault(p,{})[k]=v
    vectors={s:{p:np.array([math.cos(o['L']),math.sin(o['L'])])*o['S'] for p,o in rows.items() if 'L' in o and 'S' in o} for s,rows in local.items()}
    first=next(iter(vectors))
    xy={first:np.zeros(2), **vectors[first]}
    done={first}
    while len(done)<len(vectors):
        progress=False
        for s,rows in vectors.items():
            if s in done:
                continue
            common=[p for p in rows if p in xy]
            if len(common)<2:
                continue
            X=np.array([rows[p] for p in common]); Y=np.array([xy[p] for p in common])
            U,_,Vt=np.linalg.svd((X-X.mean(0)).T @ (Y-Y.mean(0)))
            D=np.eye(2); D[-1,-1]=np.linalg.det(U@Vt)
            R=U@D@Vt; origin=Y.mean(0)-X.mean(0)@R
            xy[s]=origin
            for p,v in rows.items():
                xy.setdefault(p,origin+v@R)
            done.add(s); progress=True
        if not progress:
            raise ValueError('Cannot initialize: stations require two overlapping targets')
    common=[p for p in fixed if p in xy]
    if len(common)<2:
        raise ValueError('At least two connected fixed plane points required')
    X=np.array([xy[p] for p in common]); Y=np.array([fixed[p] for p in common])
    U,_,Vt=np.linalg.svd((X-X.mean(0)).T@(Y-Y.mean(0)))
    D=np.eye(2); D[-1,-1]=np.linalg.det(U@Vt); R=U@D@Vt
    return {p:(v-X.mean(0))@R+Y.mean(0) for p,v in xy.items()}

def plane_adjust(path, variance_iterations=12, free=False):
    header,fixed,obs=parse_in2(path)
    xy=initial_coordinates(fixed,obs)
    xy.update(fixed)
    if free:
        fixed = {}
    names=[p for p in xy if p not in fixed]
    stations=list(dict.fromkeys(o[0] for o in obs))
    idx={p:2*i for i,p in enumerate(names)}
    oi={s:2*len(names)+i for i,s in enumerate(stations)}
    n=2*len(names)+len(stations)
    x=np.zeros(n)
    for p,i in idx.items(): x[i:i+2]=xy[p]
    oriented=set()
    for s,p,k,v in obs:
        if k=='L':
            if s in oriented: continue
            delta=xy[p]-xy[s]; x[oi[s]]=math.atan2(delta[1],delta[0])-v
            oriented.add(s)
    direction=np.array([o[2]=='L' for o in obs])
    # Candidate stochastic model; must be assessed against legacy outputs.
    sigma=np.array([header[0] if k=='L' else math.hypot(header[1],header[2]*v/1000) for _,_,k,v in obs])
    history=[]
    for outer in range(variance_iterations):
        for inner in range(40):
            A=np.zeros((len(obs),n)); l=np.zeros(len(obs))
            def coord(p): return x[idx[p]:idx[p]+2] if p in idx else fixed[p]
            for row,(s,p,k,v) in enumerate(obs):
                delta=coord(p)-coord(s); r=np.linalg.norm(delta)
                if r<1e-6: raise ValueError('Zero length sight')
                if k=='L':
                    predicted=math.atan2(delta[1],delta[0])-x[oi[s]]
                    l[row]=math.atan2(math.sin(v-predicted),math.cos(v-predicted))*ARC
                    deriv=np.array([-delta[1],delta[0]])/r**2*ARC
                    A[row,oi[s]]=-ARC
                else:
                    l[row]=(v-r)*1000
                    deriv=delta/r*1000
                for point,sign in ((s,-1),(p,1)):
                    if point in idx: A[row,idx[point]:idx[point]+2]=sign*deriv
            B=A/sigma[:,None]
            if free:
                # Inner constraints select a datum without adding observations.
                G=np.zeros((3,n))
                center=np.array([x[idx[p]:idx[p]+2] for p in names]).mean(0)
                for p,i in idx.items():
                    dx,dy=x[i:i+2]-center
                    G[0,i]=1; G[1,i+1]=1
                    G[2,i]=-dy; G[2,i+1]=dx
                for s,i in oi.items(): G[2,i]=1
                G/=np.linalg.norm(G,axis=1)[:,None]
                augmented=np.vstack((B,G))
                correction,_,rank,_=np.linalg.lstsq(augmented,np.r_[l/sigma,[0,0,0]],rcond=None)
            else:
                augmented=B
                correction,_,rank,_=np.linalg.lstsq(B,l/sigma,rcond=None)
            if rank<n: raise ValueError('Rank deficient plane network beyond the selected datum')
            x+=correction
            if np.max(abs(correction))<1e-9: break
        else: raise ValueError('Plane iteration did not converge')
        v=A@correction-l
        Q=np.linalg.solve(augmented.T@augmented,np.eye(n))
        if free:
            # Remove the artificial datum constraint variances.
            Q-=G.T@G
        redundancy=1-np.einsum('ij,jk,ik->i',B,Q,B)
        wv=v/sigma
        vt=float(np.sum(wv[direction]**2)/sum(redundancy[direction]))
        vs=float(np.sum(wv[~direction]**2)/sum(redundancy[~direction]))
        history.append({'iteration':outer+1,'distance_to_direction_variance':vs/vt})
        if abs(vs/vt-1)<0.01: break
        if outer==variance_iterations-1:
            raise ValueError('Variance components did not converge')
        sigma[~direction]*=math.sqrt(vs/vt)
    f=len(obs)-n+(3 if free else 0)
    if f<=0: raise ValueError('Network has no redundancy for precision estimation')
    variance=float(wv@wv/f)
    points={p:{'X_m':float(c[0]),'Y_m':float(c[1]),'MX_mm':0.,'MY_mm':0.,'MP_mm':0.} for p,c in fixed.items()}
    for p,i in idx.items():
        sx,sy=np.sqrt(np.diag(Q)[i:i+2]*variance)*1000
        points[p]={'X_m':float(x[i]),'Y_m':float(x[i+1]),'MX_mm':float(sx),'MY_mm':float(sy),'MP_mm':float(math.hypot(sx,sy))}
    return {'model':('free inner datum' if free else 'fixed XY')+' + per-station orientation; two-group variance estimate',
            'points':points,'observations':len(obs),'unknown_points':len(names),'stations':len(stations),'dof':f,
            'variance_history':history,'sigma_direction_arcsec':float(sigma[direction][0]*math.sqrt(variance)),
            'residuals':[{'from':s,'to':p,'type':k,'v':float(v[i]),'unit':'arcsec' if k=='L' else 'mm','redundancy':float(redundancy[i])} for i,(s,p,k,_) in enumerate(obs)]}
