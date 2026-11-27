# 独立比较缓存边界

DESIGN §5.3及既有verify-sharing失败前置为oracle。手写拓扑、已有Core坏输入与完整真实输入
分别验证，不能用两份同样错误的事实得到零差异来替代正确性；原752目标检查继续独立运行。

```sh
HIER_B_PRODUCT_ROOT=/absolute/fixed-product \
HIER_BIN=/absolute/owned/hier \
HIER_B_COMPARISON_REPORT=/absolute/new-cli-report.json \
python3 comparison-cache.py
```

30组CLI输入：8正常/位置/极值、13非法值、2缺值、4命令边界、3原坏设计前置。
size_t最大值从本机C ABI取得，所有参数按argv数组原样传入。30秒只为防挂死，不是产品SLA。
报告以x模式创建，不覆盖旧原件。serve在Hello前的失败按既有§5.6.1写stderr，stdout为空；
单次CLI参数错误仍断言bad_request。首次旧基线的错误JSON解析保留，修订依据既有契约。
重复参数和等号缩写没有独立规范，不自行规定其语义。
