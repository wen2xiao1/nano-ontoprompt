# OntoPrompt Harness 规则引擎 — 实现 Prompt

> **喂给 Coding Agent 用。** 目标：在 LLM + Prompt 基础上，加一层 Harness 规则，让 Ontology 抽取结果从「时好时坏」变成「稳定可用」。
>
> 关联文档：[[requirements-e2e-prompt-tool.md]]（架构上下文）
>
> 语言：Python 3.11+ | 依赖：无需新框架，纯 Python 实现

---

## 一、你要做什么

在 OntoPrompt 的「用户上传文档 → MarkItDown 转换 → LLM 抽取」链路中，嵌入三层 Harness：

```
文档 → [Pre-Harness] → LLM → [Post-Harness] → [Orchestration-Harness] → 写入数据库
```

每一层都是可插拔的 Pipeline Stage，可以独立开关。实现分 4 个阶段（P0-P3），每阶段产出可测试的增量。

---

## 二、数据模型（所有阶段共享）

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# ─── 严重级别 ───
class Severity(Enum):
    FATAL = "fatal"      # 阻断写入，必须修复
    ERROR = "error"      # 需要人工审查
    WARNING = "warning"  # 记录但不阻断
    INFO = "info"        # 统计信息

# ─── 校验报告 ───
@dataclass
class ValidationIssue:
    severity: Severity
    code: str                       # 如 "MISSING_ID", "REFERENCE_BROKEN"
    message: str                    # 人类可读的描述
    location: Optional[dict] = None # {"entity_id": "ent_001", "field": "type"}
    suggestion: Optional[str] = None

@dataclass
class ValidationReport:
    issues: list[ValidationIssue] = field(default_factory=list)
    
    def has_fatal(self) -> bool:
        return any(i.severity == Severity.FATAL for i in self.issues)
    
    def has_errors(self) -> bool:
        return any(i.severity == Severity.ERROR for i in self.issues)
    
    def by_severity(self) -> dict[Severity, list[ValidationIssue]]:
        result = {s: [] for s in Severity}
        for i in self.issues:
            result[i.severity].append(i)
        return result

# ─── 流程日志（用于端到端追踪） ───
@dataclass
class ProcessingLog:
    pipeline_stages: list[dict] = field(default_factory=list)  # [{stage, status, duration_ms, detail}]
    input_stats: dict = field(default_factory=dict)            # {file_count, total_chars, estimated_tokens}
    output_stats: dict = field(default_factory=dict)           # {entity_count, relation_count, action_count}
```

---

## 三、P0：Post-Harness — LLM 输出质量门禁（最重要，先做）

**目标**：LLM 输出 JSON 后，在写入数据库之前，执行 5 项校验。校验不通过则不写入，返回错误信息给前端。

### 实现文件

```
engine/post_harness/
  __init__.py
  validator.py          # 主校验器
  checks/
    __init__.py
    structure_check.py  # 1. 基本结构检查
    field_check.py      # 2. 必填字段检查
    reference_check.py  # 3. 引用完整性检查
    dedup_check.py      # 4. 去重检查
    type_check.py       # 5. 类型白名单检查
```

### 接口定义

```python
# validator.py
class PostHarnessValidator:
    """
    LLM 输出质量门禁。
    在 post /api/ontologies/:id/execute/status 的 parsing_output 步骤中调用。
    """
    
    def __init__(self, type_whitelist: Optional[dict] = None):
        """
        type_whitelist 示例:
        {
            "entity_types": {"Supplier", "Material", "ProductionLine"},
            "relation_types": {"supplies", "consumed_by"},
            "strict_mode": True  # True=不在白名单的直接报错, False=降级为Custom:
        }
        """
        self.whitelist = type_whitelist
        self.checks = [
            StructureCheck(),
            FieldCheck(),
            ReferenceCheck(),
            DedupCheck(),
            TypeCheck(type_whitelist),
        ]
    
    def validate(self, data: dict) -> ValidationReport:
        """
        执行所有检查，返回完整报告。
        - 如果 report.has_fatal() → 不写入数据库，前端展示错误
        - 如果 report.has_errors() → 写入数据库，但标记为「需人工审查」
        - 如果只有 warning → 正常写入，记录 warning 到 execution_log
        """
        report = ValidationReport()
        for check in self.checks:
            check.execute(data, report)
        return report
```

### 5 项检查的详细逻辑

#### 1. StructureCheck — 基本结构检查

```python
# 必须通过，否则 FATAL
- data 必须是 dict
- data["entities"] 必须存在且为 list
- data["relationships"] 如果存在，必须是 list
- data["actions"] 如果存在，必须是 list

# 如果 entities 为空数组，且非空文档 → ERROR（提示：可能 Prompt 不合适）
# 如果 entities 为空数组，且文档极短 → WARNING（文档本身可能不含结构化信息）
```

#### 2. FieldCheck — 必填字段检查

```python
# 对每个 entity:
- 必须有 id → 缺少则自动生成 UUID，记录 WARNING
- 必须有 type → 缺少则 ERROR
- 必须有 name → 缺少则 ERROR
- 如果没有 description → WARNING（不影响使用，但影响可读性）

# 对每个 relationship:
- 必须有 id → 缺少则自动生成 UUID，记录 WARNING
- 必须有 source_id 和 target_id → 缺少则 ERROR
- 必须有 type → 缺少则 ERROR

# 对每个 action:
- 必须有 id → 缺少则自动生成 UUID，记录 WARNING
- 必须有 name → 缺少则 ERROR
- 必须有 label → 缺少则 WARNING（fallback 到 name）
```

#### 3. ReferenceCheck — 引用完整性检查

```python
# 对每个 relationship:
- 建立 entity_ids = set(e["id"] for e in data["entities"])
- 如果 relationship.source_id NOT IN entity_ids → ERROR（引用不存在的实体）
- 如果 relationship.target_id NOT IN entity_ids → ERROR
- 注：如果只是 WARNING 级别，可以自动删除该关系并继续

# 对每个 action:
- 如果 action.trigger_entity_types 中有不在 entity_ids 的类型 → WARNING
```

#### 4. DedupCheck — 去重检查

```python
# 实体去重: 按 (name, type) 分组
- 如果同一 (name, type) 出现多次 → WARNING
- 如果两个实体的 name 完全相同但 type 不同 → INFO（可能是合理的，如"苹果"既是水果也是公司）
- 额外: 计算编辑距离 < 3 的实体名对 → WARNING（可能是拼写差异，如"GPT-4"和"GPT4"）

# 关系去重: 按 (source_id, type, target_id) 分组
- 如果完全重复 → WARNING，自动去重只保留一条

# 动作去重: 按 name 分组
- 如果 name 重复 → WARNING，自动去重
```

#### 5. TypeCheck — 类型白名单检查

```python
# 只在 whitelist 不为 None 时执行
- 对每个 entity.type:
  - 如果在 whitelist.entity_types 中 → 通过
  - 如果不在 → strict_mode=True 时报 ERROR，False 时自动重命名为 f"Custom:{original_type}"
- 对每个 relationship.type:
  - 如果在 whitelist.relation_types 中 → 通过
  - 如果不在 → strict_mode=True 时报 ERROR，False 时记录 WARNING
  
# 统计: 如果 Custom: 类型的实体超过总数 50% → WARNING
#        "当前抽取结果中 {n}% 的实体类型不在预设列表中，建议更新 Prompt 的类型定义"
```

### P0 验收标准

```
Given: 一段中文文本 + 一个通用的 OpenAI 风格 LLM 返回（含一个空 entities 数组）
When:  执行 PostHarnessValidator.validate()
Then:  报告包含 Fatal 级别的「entities 不能为空」问题

Given: 一段文本 + LLM 返回（5 个实体，其中 2 个缺少 id，1 个缺少 type）
When:  执行 validate()
Then:  缺少 id 的实体被自动分配 UUID，缺少 type 的实体被标记 ERROR
Then:  报告 contains 1 个 ERROR，2 个 WARNING

Given: LLM 返回的实体中有 2 个完全相同的 (name, type) 对
When:  执行 validate()
Then:  报告包含 1 个 WARNING「实体 X 重复出现」

Given: LLM 返回的关系中 source_id 指向不存在的实体
When:  执行 validate()
Then:  报告包含 1 个 ERROR「关系 Y 引用不存在的 source_id」
```

---

## 四、P1：Pre-Harness — LLM 输入优化

**目标**：在文本进入 LLM Prompt 之前，做裁剪、聚焦、约束注入。

### 实现文件

```
engine/pre_harness/
  __init__.py
  context_trimmer.py    # 1. 上下文裁剪
  constraint_injector.py # 2. 动态约束注入
  text_preprocessor.py  # 3. 文本预处理
```

### 1. ContextTrimmer — 上下文裁剪

```python
class ContextTrimmer:
    """
    将超长文档裁剪到 LLM 上下文窗口的 target_ratio 以内。
    如果超出，按策略分段。
    """
    
    def __init__(self, context_window: int = 128000, target_ratio: float = 0.6):
        self.max_tokens = int(context_window * target_ratio)
    
    def estimate_tokens(self, text: str) -> int:
        """
        粗估 token 数。
        中文：平均 1.5 字符/token
        英文：平均 0.75 字符/token
        混合：分别计算后相加
        """
        chinese = sum(1 for c in text if '一' <= c <= '鿿')
        english = len(text) - chinese
        return int(chinese * 1.5 + english * 0.75)
    
    def trim_or_segment(self, text: str, metadata: dict) -> TrimResult:
        """
        返回 TrimResult:
        - segments: list[str]  # 分段后的文本列表
        - strategy_used: str    # "single" | "natural_split" | "equal_split"
        - was_trimmed: bool
        
        分段策略优先级：
        1. 如果在 max_tokens 内 → 不分段，直接返回
        2. 如果超出 → 按 Markdown 标题（^#{1,3}）分段
        3. 如果 Markdown 标题不足 → 按段落（\n\n）分段
        4. 如果段落还超 → 按等宽切分
        """
    
    def extract_relevant_sections(self, text: str, entity_keywords: list[str]) -> str:
        """
        相关性预筛（可选优化）：
        只保留包含（或邻近）entity_keywords 的段落。
        用于超长文档中锁定候选实体所在的区域。
        """
```

### 2. ConstraintInjector — 动态约束注入

```python
class ConstraintInjector:
    """
    从文档内容中动态提取候选实体/关系类型，注入 Prompt。
    减少 LLM「自由发挥」的空间。
    """
    
    def extract_candidate_types(self, documents: list[str]) -> dict:
        """
        从文档中提取候选类型：
        1. 扫描表格表头（如 "供应商名称/物料编码/订单号"）
        2. 扫描 Markdown 列表和标题
        3. 扫描重复出现的名词短语
        4. 用预设的「类型同义词映射表」归一化
        
        返回:
        {
            "entity_types": ["Supplier", "Material", ...],
            "relation_verbs": ["供应", "消耗", "生产", ...],
            "source": "文档表格头"
        }
        """
    
    def inject_into_prompt(self, prompt_template: str, constraints: dict) -> str:
        """
        将约束注入 Prompt 模板。
        替换模板中的 {dynamic_constraints} 占位符。
        """
    
    # 类型同义词映射表（配置化，可扩展）
    SYNONYM_MAP = {
        "供应商": "Supplier",
        "供货商": "Supplier",
        "vendor": "Supplier",
        "物料": "Material",
        "原材料": "Material",
        "材料": "Material",
        "产线": "ProductionLine",
        "生产线": "ProductionLine",
        "客户订单": "CustomerOrder",
        "采购订单": "PurchasingOrder",
        "仓库": "Warehouse",
    }
```

### 3. TextPreprocessor — 文本预处理

```python
class TextPreprocessor:
    """
    文本进入 Prompt 前的清洗和格式化。
    """
    
    def clean(self, text: str) -> str:
        """
        1. 去除连续空行（保留最多 1 个空行）
        2. 去除不可见字符（零宽空格等）
        3. 统一换行符为 \n
        4. 表格格式对齐（去除多余的空白列）
        """
    
    def normalize_numbers(self, text: str) -> str:
        """
        统一数字格式：
        1. 全角数字 → 半角（"１２３" → "123"）
        2. 中文数字 → 阿拉伯数字（仅对明确的数量词，如 "五千" → "5000"）
        """
```

### P1 验收标准

```
Given: 一篇 200K token 的长文档（超出 128K 上下文窗口）
When:  ContextTrimmer.trim_or_segment()
Then:  返回 2+ 个 segments，每个 segment 在 max_tokens 以内

Given: 文档包含表格，表头为 ["供应商", "物料", "数量"]
When:  ConstraintInjector.extract_candidate_types()
Then:  返回 entity_types 包含 ["Supplier", "Material"]

Given: LLM 返回的 entities 中有 3 个 type 为 "Person"
When:  ConstraintInjector 运行后
Then:  下一个 Prompt 的 {dynamic_constraints} 包含 "Person"
```

---

## 五、P2：Orchestration-Harness — 多步编排

**目标**：把一步 `Prompt → JSON` 拆成 `实体抽取 → 关系抽取` 两步，让 LLM 每步专注一个子任务。

### 实现文件

```
engine/orchestration/
  __init__.py
  two_step_pipeline.py  # 两步走编排器
  merge_utils.py        # 结果合并工具
```

### TwoStepPipeline

```python
@dataclass
class StepConfig:
    prompt_template: str
    temperature: float
    model: str
    retry_count: int = 2

@dataclass
class PipelineResult:
    entities: list[dict]
    relationships: list[dict]
    actions: list[dict]
    merge_log: list[str]  # 记录合并过程中的决策

class TwoStepPipeline:
    """
    两步走编排器。
    
    Step 1: 实体抽取
        Prompt: "只提取实体，每个实体注明出自原文哪句话。宁多勿缺，不要求关系。"
        temperature: 0.3（允许一定探索）
        
    Step 2: 关系抽取
        Prompt: "已知以下实体列表：{step1_entities}。从原文中找出它们之间的关系。"
        temperature: 0.1（偏保守，只提取明确的）
    """
    
    def __init__(self, step1: StepConfig, step2: StepConfig):
        self.step1 = step1
        self.step2 = step2
    
    async def run(self, text: str, llm_caller: Callable) -> PipelineResult:
        """
        执行流程：
        1. 调用 step1 LLM → 拿到 entities（含 provenance 字段，记录来源原文）
        2. 对 entities 执行 Post-Harness（复用 P0）→ 校验通过的进入 step2
        3. 将实体列表注入 step2 Prompt → 调用 step2 LLM → 拿到 relationships
        4. 合并 entities + relationships + actions
        5. 再次执行 Post-Harness → 返回最终结果
        """
    
    def _deduplicate_entities(self, entities: list[dict]) -> list[dict]:
        """
        实体去重 + 属性合并：
        - 同名同类型的 → 合并属性值，conf 取均值
        - 同名不同类型的 → 保留两个，记录 WARNING
        """
```

### P2 验收标准

```
Given: 一篇混杂的报告（含公司信息 + 产品描述 + 合作关系）
When:  两步走 vs 一步走 对比
Then:  两步走的实体 recall 高于一步走（专注度高，不易遗漏）
Then:  两步走的关系准确率高于一步走（已知实体列表后，关系判断更准确）

备注：验收时在同文档上跑两次（一步 vs 两步），人工对比结果。
```

---

## 六、P3：Self-Consistency Harness — 多 LLM 冗余校验（可选）

**目标**：对关键抽取，用两个 LLM 互相校验，标记分歧点。

### 实现文件

```
engine/consistency/
  __init__.py
  cross_validator.py  # 跨 LLM 校验器
  voting.py           # 投票合并逻辑
```

```python
class CrossValidator:
    """
    冗余校验策略：
    1. 用 Model A 和 Model B 分别对同一文档做抽取
    2. 计算实体级别的 Jaccard 相似度
    3. 根据一致率决定下一步
    
    一致率 ≥ 80% → 直接采纳 Model A 的结果（更便宜的模型）
    50% ≤ 一致率 < 80% → 取交集 + 标记差异供人工审查
    一致率 < 50% → 全部标记「需人工审查」
    """
    
    def jaccard_similarity(self, entities_a: list[dict], entities_b: list[dict]) -> float:
        """基于 (name, type) 对计算 Jaccard 相似度"""
        set_a = {(e['name'], e['type']) for e in entities_a if 'name' in e and 'type' in e}
        set_b = {(e['name'], e['type']) for e in entities_b if 'name' in e and 'type' in e}
        if not set_a or not set_b:
            return 0.0
        return len(set_a & set_b) / len(set_a | set_b)
    
    def merge_with_conflict_markers(self, data_a: dict, data_b: dict, similarity: float) -> dict:
        """
        合并两个结果，标记不一致处：
        在实体/关系的 properties 中添加 _conflict 字段说明差异
        """
```

### P3 验收标准

```
Given: 同一文档，用 GPT-4o 和 Claude 3.5 分别抽取
When:  CrossValidator.jaccard_similarity()
Then:  返回 0.0~1.0 的相似度分数

Given: 两个分歧较大的抽取结果
When:  merge_with_conflict_markers()
Then:  输出中每个分歧实体的 properties 包含 _conflict 字段
Then:  人工可以一眼看出哪里不一致
```

---

## 七、集成点（Integration Points）

所有 Harness 需要接入 OntoPrompt 的现有执行流程（`7.7 LLM 抽取异步任务`）：

```
当前流程:
  上传文档 → MarkItDown → 合并文本 → LLM 调用 → 解析输出 → 写入数据库

集成后流程:
  上传文档 → MarkItDown → 合并文本
    → [P1] Pre-Harness: 裁剪/约束注入
    → [P2] Orchestration: 两步走可选
    → LLM 调用
    → 解析输出
    → [P0] Post-Harness: 质量门禁
      → 通过 → [P3] Cross-Validation: 冗余校验（可选）
        → 写入数据库
      → 不通过 → 返回错误给前端，不写入
```

集成点代码示例：

```python
# 在 Celery task 中调用
class OntologyExtractionPipeline:
    def __init__(self, config: dict):
        self.pre_harness = PreHarness(config.get('pre', {}))
        self.post_harness = PostHarnessValidator(config.get('post', {}))
        self.orchestration = TwoStepPipeline(
            config.get('step1', {}), 
            config.get('step2', {})
        ) if config.get('two_step') else None
    
    async def run(self, text: str, prompt_template: str, metadata: dict) -> ExtractionResult:
        processing_log = ProcessingLog()
        
        # Pre-Harness
        trimmed = self.pre_harness.trim(metadata={'file_count': ...})
        prompt = self.pre_harness.inject_constraints(prompt_template, text)
        
        # LLM Call
        raw_output = await llm_call(prompt, temperature=0.1)
        
        # Parse + Post-Harness
        parsed = json_parser.parse(raw_output)
        report = self.post_harness.validate(parsed)
        
        if report.has_fatal():
            return ExtractionResult(status="failed", errors=report)
        
        return ExtractionResult(status="completed", data=parsed, warnings=report)
```

---

## 八、测试策略

```
tests/
  test_post_harness.py     # P0: 5 项检查的单元测试
  test_pre_harness.py      # P1: 裁剪 + 约束注入
  test_orchestration.py    # P2: 两步走流程
  test_consistency.py      # P3: 冗余校验
  
  fixtures/
    valid_output.json       # 合法 LLM 输出（用于通过测试）
    missing_fields.json     # 缺少必填字段
    broken_references.json  # 引用不存在的实体
    empty_entities.json     # 实体数组为空
    duplicate_entities.json # 重复实体
    long_document.md        # 超长文档（100K+ tokens）
```

---

## 九、实施顺序建议

| 阶段 | 工作量 | 独立可测试 | 建议 |
|------|--------|-----------|------|
| P0 Post-Harness | ~2 天 | ✅ 无需 LLM | **先做**，效果最明显，没有副作用 |
| P1 Pre-Harness | ~1 天 | ✅ 可单独测 | **第二做**，减少 LLM 花销 |
| P2 Orchestration | ~2 天 | ✅ 可用 mock | **第三做**，需要前两阶段稳定 |
| P3 Cross-Validation | ~3 天 | ✅ 可用 fixture | **可选**，取决于精度要求 |

每个 P 独立可开关，通过配置控制：

```json
{
  "harness": {
    "post_validation": { "enabled": true, "strict_mode": false },
    "pre_trimmer": { "enabled": true, "context_window": 128000, "target_ratio": 0.6 },
    "pre_constraint_injection": { "enabled": false },
    "two_step_pipeline": { "enabled": false },
    "cross_validation": { "enabled": false }
  }
}
```
