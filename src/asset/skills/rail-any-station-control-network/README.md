# 轨道任意设站控制网

已包含确定性平差解算器、成果报告模板和 Word/Excel 输出。用户提供的徐望区间原始工程样例仅用于 WorkWise 隔离回归验收，不随应用包分发。现行国标术语使用“任意设站控制网”；旧“轨道基础控制网/铺轨CPⅢ”仅用于历史资料映射。

```sh
python -m pip install -r requirements.txt
python -m zipfile -e /path/to/user-provided/xuwang-original.zip /tmp/xuwang-example
python scripts/reproduce_project.py /tmp/xuwang-example/徐望左线.4 --out /tmp/xuwang-left-output
python scripts/reproduce_project.py /tmp/xuwang-example/徐望右线.4 --out /tmp/xuwang-right-output
python scripts/reproduce_project.py /tmp/xuwang-example/徐望右线.4 --role assessment --out /tmp/xuwang-right-assessment
python -m unittest discover -s tests -v
```

Windows 可用 `py` 替换 `python`，更换临时目录。Agent 使用时读取 `SKILL.md`，保留完整包；不依赖平台 API。

程序从 IN1/IN2 独立计算，再与原计算文件比较。`--role survey` 的正式交付固定为“工程测量、测量成果、技术报告”三部分；`--role assessment` 只输出第三方评估报告。Word 和 Excel 包含完整坐标、精度、改正数和比对记录；用户提供的两条线1775项回归记录已在隔离目录验证。

目前未实现原始 SUC 到历史完整报告逐字逐数复刻；归算、IN3、粗差、接边、自由网公共点转换、历史 DOC 版式仍待验证。复制原件不算复算通过。详见 `PIPELINE_STATE.md`。
