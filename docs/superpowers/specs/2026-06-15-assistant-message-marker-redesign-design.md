# Assistant 消息标记重设计 — Design Spec

> 日期：2026-06-15
> 关联 issue：#285（Redesign assistant message UI）
> 设计语言：Aurora Glass（`apps/frontend/docs/design-language.md` 为准）

## 1. 背景与动机

当前 Chat 流里 assistant 回合是**全宽正文**，上方挂一个标记行：一个 13px 的玻璃方块点（`.assistantDot`）+ 大写灰字 “ASSISTANT” 标签（`.assistantLabel`），下方一行时间戳。

全宽布局本身没有问题，要保留。问题在于这个**标记过于朴素**——一个小方块加一行小灰字，和同一条流里的 user 玻璃气泡、工具/思考玻璃卡片相比缺少存在感与科技感（issue #285 称其 "unresolved / 简陋"）。

本次只重设计 assistant 的**标记**，不改布局结构。

## 2. 设计方向

**克制精修**：只替换标记本身，保留"小标记 + 全宽正文"结构。不引入回合容器、不加边栏、不改全宽布局。科技感通过**材质与造型**实现（玻璃 + 真品牌 logo 的拓扑气质），不靠动画——遵循设计语言 P3「motion 事件驱动、静止态完全静止」。

明确**不**采用的更激进方向：给回合包材质容器 / 发光左边栏（改动过大，本次不做）。

## 3. 标记构成

替换现有的 `.assistantDot`（13px 玻璃方块）+ 大写 “ASSISTANT” 标签，改为：

### 3.1 圆形玻璃徽记（sigil）

- 尺寸 **32px**，`border-radius: 50%`。
- 材质复用现有 Aurora Glass token，与导航栏品牌基座同源，仅形状从圆角方形改为圆形：
  - `background: var(--aurora-glass-fill)`
  - `border: 1px solid var(--aurora-glass-border)`
  - `box-shadow: var(--aurora-glass-highlight)`
- 圆形与 user 气泡的圆角矩形形成对照，强化"AI 署名印记"的识别性。

### 3.2 徽记内的 logo

- 放置**真正的** OmniCraft 节点拓扑 logo，**几何原样不改、不重涂**（设计语言 §6.4 品牌资产规则）。
- 资产已存在：`apps/frontend/src/assets/icons/omnicraft-dark.svg` 与 `omnicraft-light.svg`。
- logo 渲染尺寸约 20px（在 32px 徽记内居中）。
- **按主题切换**：dark 主题用 `omnicraft-dark.svg`，light 主题用 `omnicraft-light.svg`——与导航栏 `SidebarView` 现有的 `BRAND_ICONS[theme]` 做法一致。

### 3.3 字标

- 徽记旁显示 **OmniCraft** 字样，使用 `var(--font-display)`（Bricolage Grotesque），替换原先大写小灰字的 “Assistant”。

## 4. 保持不变

- assistant 全宽正文布局（`fullWidthMessage`）。
- `MarkdownRenderer` 渲染正文。
- 空态显示 `WorkingIndicator`（content 为空时）。
- 正文下方时间戳（`RenderItem` 负责，content 非空时显示）。
- 进入动画 `fadeInUp`（已是事件驱动，符合 P3）。
- user 气泡、工具/思考卡片不变。

## 5. 主题与动效

- **两个主题均为一等公民**（P4）：各用对应 SVG + 各自的玻璃 token 值，不把暗色效果硬搬到亮色。
- **徽记完全静止**：无发光脉冲、无循环动画。符合 P3。
- 不新增 motion。

## 6. 影响文件

- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble/MessageBubbleView.tsx`
  - assistant 分支：渲染圆形徽记（按主题选 SVG）+ OmniCraft 字标，替换 `.assistantDot` + `.assistantLabel`。
  - 引入两个 SVG（`?react`）并按当前主题选用——参考 `SidebarView.tsx` 的 `BRAND_ICONS` 模式。需要读取主题（沿用 Sidebar 同款主题来源）。
- `.../MessageBubble/styles.module.css`
  - 新增 `.sigil` 圆形玻璃样式；移除 `.assistantDot`；调整/重命名 `.assistantLabel` 为标记行（图标 + 字标横向排列）。
- 测试：现有 `WorkingIndicatorView` / `RenderItem` 测试不依赖标记 DOM 细节，预期不受影响；落地后跑 `bun run test` 确认。

## 7. 验收

- `bun dev`（仓库根）起服务，浏览器中 **dark 与 light 两套主题**各看一个真实 user→assistant 回合。
- 确认：
  - 32px 徽记内 logo 清晰可辨（若偏糊，再讨论微调尺寸——本次先按 32px 落地观察）。
  - 徽记 + 字标与 user 气泡、工具/思考卡片在视觉上协调。
  - 静止态完全无动画。
- `bun run test` 全绿（注意用 `bun run test`，不要用 `bun test`）。

## 8. 开放项

- 徽记尺寸最终值：先定 32px，接进 Chat 跑起来后在浏览器里按实际清晰度决定是否微调。
