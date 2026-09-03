# 工程测量策略固定数值参考

本文件是 WorkWise 0.5.0 测量数值 fixture 的静态参考记录。预期值由下列解析式或预先固定的合成参数得到，不从被测 Runtime 的输出回填。数值内核统一使用米、弧度和无量纲比值。

通用平差模型采用 `v = A x - l`、`N = Aᵀ P A`、`x = N⁻¹ Aᵀ P l`，精度统计采用 `σ₀² = vᵀPv / (n-u)`。方法依据 Charles D. Ghilani, *Adjustment Computations: Spatial Data Analysis*, 6th edition 的加权最小二乘框架。高斯—克吕格与 Helmert 参数约定对照 EPSG Guidance Note 7-2；CPIII 观测构形对照 TB 10601；变形量符号对照 JGJ 8。这里的固定值用于软件回归验证，不替代项目级测量技术设计和注册测绘师复核。

## REF-LEVELING-001

- Golden：`SURVEY-GOLDEN-LEVELING-001`。BM1=100 m，第一条观测给出 `H(P1)=101.0000 m`；反向观测 -0.999 m 等价于 `H(P1)=100.9990 m`。路线长 1 km、4 km，权为 1、0.25，因此加权高程为 `(1×101.0000+0.25×100.9990)/1.25=100.9998 m`，两条观测残差分别为 -0.0002 m、-0.0008 m。
- Negative：`SURVEY-NEG-LEVELING-001`。没有任何已知高程时，基准未定义，必须返回 `missing_datum`，不能生成相对高程冒充约束成果。

## REF-HEIGHT-CONTROL-001

- Golden：`SURVEY-GOLDEN-HEIGHT-CONTROL-001`。BM-A=50 m、BM-B=51 m，两段观测和为 1.001 m，附合闭合差为 +0.001 m；等权分配后每段残差 -0.0005 m，P=50.3995 m。
- Negative：`SURVEY-NEG-HEIGHT-CONTROL-001`。已知点缺少高程时必须返回 `missing_datum`。

## REF-TRAVERSE-001

- Golden：`SURVEY-GOLDEN-TRAVERSE-001`。固定 A(0,0)、B(100,100)，起始方位 0°，两边均 100 m，中间右角 270°；解析坐标为 P(0,100)，角度、X、Y 和相对闭合差均为 0。
- Negative：`SURVEY-NEG-TRAVERSE-001`。打乱边的连续顺序后不再构成有序导线，必须返回 `malformed_geometry`。

## REF-PLANE-CONTROL-001

- Golden：`SURVEY-GOLDEN-PLANE-CONTROL-001`。A(0,0)、B(100,0)，AP=100 m、BP=√20000 m，同时方向与测站角约束给出唯一交点 P(0,100)。
- Negative：`SURVEY-NEG-PLANE-CONTROL-001`。只给一个到固定点的距离时，二维未知坐标少一个独立约束，法方程秩亏，必须返回 `rank_deficient`。

## REF-TRIANGULATION-001

- Golden：`SURVEY-GOLDEN-TRIANGULATION-001`。AB=100 m，A、B 内角各 45°，P 角 90°，解析交点 P(50,50)。
- Negative：`SURVEY-NEG-TRIANGULATION-001`。只有距离、没有 station/left/right 角度构形时必须返回 `invalid_observation`。

## REF-CPIII-FREE-STATION-001

- Golden：`SURVEY-GOLDEN-CPIII-FREE-STATION-001`。由固定目标 A(0,0,10)、B(100,0,12)、C(0,100,11) 从 S(40,30,8) 反算方向读数，定向参数固定为 10°；斜距和天顶距由同一高差/水平距生成，解应恢复 S 和定向参数。
- Negative：`SURVEY-NEG-CPIII-FREE-STATION-001`。少于三个固定方向目标时平面后方交会构形不足，必须返回 `malformed_geometry`。

## REF-CPIII-RESECTION-001

- Golden：`SURVEY-GOLDEN-CPIII-RESECTION-001`。采用与自由测站独立编号的同一解析几何构形，结果应恢复 S(40,30,8) 和 10° 定向参数。
- Negative：`SURVEY-NEG-CPIII-RESECTION-001`。后方交会少于三个固定方向目标时必须返回 `malformed_geometry`。

## REF-GNSS-001

- Golden：`SURVEY-GOLDEN-GNSS-001`。两个相同协方差块分别从固定 A、B 推得 P(10.001,20.000,30.000) 与 P(10.000,20.002,30.000)；广义最小二乘结果为均值 P(10.0005,20.001,30.000)，自由度 3。
- Negative：`SURVEY-NEG-GNSS-001`。标量基线不含 ΔX/ΔY/ΔZ，必须返回 `invalid_observation`。

## REF-SIMILARITY-2D-001

- Golden：`SURVEY-GOLDEN-SIMILARITY-2D-001`。控制点按 `X=5+x`、`Y=7+y` 合成，四参数解为 Tx=5 m、Ty=7 m、比例 1、旋转 0 rad；(10,20) 应变为 (15,27)。
- Negative：`SURVEY-NEG-SIMILARITY-2D-001`。单个控制点只有两条方程，四参数不可解，必须返回空解。

## REF-HELMERT-7-001

- Golden：`SURVEY-GOLDEN-HELMERT-7-001`。控制坐标按 Tx=1 m、Ty=-2 m、Tz=3 m、比例 1+2 ppm、Rx=1 µrad、Ry=-2 µrad、Rz=3 µrad 的位置矢量模型合成，拟合必须恢复同一参数。
- Negative：`SURVEY-NEG-HELMERT-7-001`。两组三维控制点只有 6 条方程，七参数不可解，必须返回空解。

## REF-GAUSS-FORWARD-001

- Golden：`SURVEY-GOLDEN-GAUSS-FORWARD-001`。CGCS2000 椭球 `a=6378137 m`、`1/f=298.257222101`，纬度 30°、经度 120.5°、中央子午线 120°；EPSG GN 7-2 横轴墨卡托级数得到北坐标 3320218.650437519 m、未加假东距的横坐标 48243.44860616793 m。
- Negative：`SURVEY-NEG-GAUSS-FORWARD-001`。未知椭球不得被替换成 CGCS2000，椭球解析必须返回空值。

## REF-GAUSS-INVERSE-001

- Golden：`SURVEY-GOLDEN-GAUSS-INVERSE-001`。以上述固定投影坐标和同一中央子午线执行反算，应恢复纬度 30°、经度 120.5°。
- Negative：`SURVEY-NEG-GAUSS-INVERSE-001`。未知椭球下禁止反算，椭球解析必须返回空值。

## REF-HEIGHT-FIT-001

- Golden：`SURVEY-GOLDEN-HEIGHT-FIT-001`。四个控制点按 `ΔH=0.5+0.001X-0.002Y` 合成；拟合参数应为 0.5 m、0.001、-0.002，(50,50,100) 的转换高程为 100.45 m。
- Negative：`SURVEY-NEG-HEIGHT-FIT-001`。三个平面位置共线时设计矩阵秩亏，必须返回空解。

## REF-DEFORMATION-001

- Golden：`SURVEY-GOLDEN-DEFORMATION-001`。三期相隔各一天，A 从 (0,0,10) 变为 (0.002,0,9.998)，因此 dX=0.002 m、dH=-0.002 m、正沉降=0.002 m、沉降速率=0.001 m/d；AB 从 2.000 m 缩短到 1.994 m，收敛 0.006 m、速率 0.003 m/d。
- Negative：`SURVEY-NEG-DEFORMATION-001`。两个期次时间戳相同，持续时间和速率无定义，必须稳定阻断。
