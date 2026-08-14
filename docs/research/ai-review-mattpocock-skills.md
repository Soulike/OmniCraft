# AI review 安装 `mattpocock/skills` 可行性调研

> 调研快照：2026-08-12。结论基于一手资料和隔离环境实测；workflow 随后按文中的浮动版本方案实现。

## 结论

**可以，且可以做到完全非交互。** 现有 AI review 用 GitHub Copilot CLI 运行 review；Copilot CLI 官方支持从项目的 `.agents/skills/` 以及个人的 `~/.copilot/skills/` / `~/.agents/skills/` 自动发现 skill。`skills` CLI 又明确支持 `github-copilot` 目标、`--skill '*'`、`--copy`、`--global` 和 `--yes`。来源：[Copilot CLI skill locations](https://github.com/github/docs/blob/c7be46d7b7d4439956d55263cbf2346fcf02c8b5/content/copilot/reference/copilot-cli-reference/cli-command-reference.md#L919-L967)、[`skills` CLI options and CI example](https://github.com/vercel-labs/skills/blob/a4d243c3d4f86cdf9385dd1b6a0733f6937e70b5/README.md#L50-L100)、[`github-copilot` install paths](https://github.com/vercel-labs/skills/blob/a4d243c3d4f86cdf9385dd1b6a0733f6937e70b5/README.md#L274-L280)。

但不能只在一个前置 job 安装一次。GitHub-hosted runner 为每个 job 创建全新 VM，同一 job 的 steps 共享文件系统，job 结束后 VM 被销毁。因此 general/security 的每个 matrix leg 和 confirm job 都要在自己的 Copilot 调用前安装。来源：[GitHub-hosted runner lifecycle](https://github.com/github/docs/blob/c7be46d7b7d4439956d55263cbf2346fcf02c8b5/content/actions/how-tos/manage-runners/github-hosted-runners/use-github-hosted-runners.md#L23-L36)。

## 建议的 CI 步骤

把下面步骤放在每个真正启动 `copilot` 的 job 内：

- general/security：`.github/actions/run-review-pass/action.yml` 中 `Install Copilot CLI` 附近（当前 [lines 50-75](../../.github/actions/run-review-pass/action.yml)）；
- confirm：`.github/workflows/ai-review.yml` 的 `Install Copilot CLI` 后、`Confirm and post` 前（当前 [lines 137-164](../../.github/workflows/ai-review.yml)）。

```yaml
- name: Install AI review skills
  env:
    CI: '1'
    NO_COLOR: '1'
    DISABLE_TELEMETRY: '1'
  run: |
    cd "$HOME"
    npx --yes skills@latest add mattpocock/skills \
      --skill '*' \
      --agent github-copilot \
      --copy \
      --yes

- name: Verify AI review skill discovery
  run: >-
    copilot -C pr-head skill list --json |
    jq -e '([.[].name] |
    (index("setup-matt-pocock-skills") != null and
    index("code-review") != null))'
```

这里有两层不同的 `yes`，两者都保留：

- `npx --yes` 关闭 npx 首次下载 `skills@latest` 时的确认；
- `skills ... --yes` 关闭 skill/目标 agent/安装 scope 等选择界面。

`cd "$HOME"` 后使用 project scope，会把 `.agents/skills` 解析为 `~/.agents/skills`；Copilot 在 `-C pr-head` 启动时会自动扫描该个人目录，不需要在非交互 session 内执行 `/skills reload`。

可以把安装放入现有 `.github/actions/setup/action.yml`，因为该 action 已提供 Node 24（[`setup/action.yml`](../../.github/actions/setup/action.yml)）；但它也被 config、prepare 和 gate job 调用，会多下载三次却没有 Copilot 消费者。更合理的位置是 review composite action 和 confirm job，或者一个只被这三类 job 调用的 reviewer-setup composite action。

## 安装内容与现有流程的关系

`mattpocock/skills` 官方 README 推荐用 `npx skills@latest add mattpocock/skills` 安装，并要求包含 `setup-matt-pocock-skills`（[README lines 25-80](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/README.md#L25-L80)）。本次决定直接跟随 installer 和 skill 仓库的最新版本，因此 CI 使用同一条浮动安装命令。

本仓库已有 `CLAUDE.md` 中的 Agent skills 指针，也已有 `docs/agents/issue-tracker.md`、`docs/agents/triage-labels.md` 和 `docs/agents/domain.md`，它们正是 setup skill 要生成的配置。该 skill 自身也说它是需要询问用户后写文件的 prompt-driven 流程，并设置了 `disable-model-invocation: true`（[`setup-matt-pocock-skills/SKILL.md`](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/setup-matt-pocock-skills/SKILL.md#L1-L16)）；Copilot CLI 官方支持这个 frontmatter 字段（[command reference lines 923-933](https://github.com/github/docs/blob/c7be46d7b7d4439956d55263cbf2346fcf02c8b5/content/copilot/reference/copilot-cli-reference/cli-command-reference.md#L923-L933)）。**CI 只要安装它，不要运行 setup skill。**

`--skill '*'` 的实际语义是安装该 commit 下发现的全部 35 个 `SKILL.md`，其中包括 `skills/in-progress/` 和 `skills/misc/`。官方 Claude plugin manifest 只发布 25 个 promoted skills（[plugin manifest](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/.claude-plugin/plugin.json)）。因此：

- 如果目标是如实装入整个仓库，使用上述 `--skill '*'`；
- 如果目标是稳定生产 review，更建议将 `--skill '*'` 改成审核过的重复 `--skill <name>` 白名单，至少不要默认纳入 `in-progress` 和 `misc`。

另外，`code-review` 的 description 会直接匹配当前 general review 任务，而它要求“Standards/Spec 两轴 + 并行 sub-agents”（[`code-review/SKILL.md`](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/code-review/SKILL.md#L1-L23)）；现有 prompt 则要求向指定 report file 写 severity 报告（[`review-general.md`](../../scripts/src/ai-review/prompts/review-general.md)）。安装可行不代表输出一定不变；正式打开前应在 throwaway PR 上确认 report file、severity 模板、耗时与 token 消耗。

## 生命周期、网络、权限与版本

- **HOME/cache：** 同一 job 内的安装 step 和 Copilot step 共享 `$HOME`，跨 job 不共享。现有 setup action 只配置了 pnpm cache（`.github/actions/setup/action.yml:11-15`），没有缓存 npm/npx 或 Copilot skill 目录，所以每个需要 skill 的 job 都会重新下载。
- **网络：** 安装 step 需要 npm registry 和 GitHub 出站访问，公开源不需要新 secret。`skills` CLI 默认还有 telemetry/audit 网络请求；上述 `DISABLE_TELEMETRY=1` 关闭 telemetry，audit 请求仍可能发生但失败不阻断安装（[`telemetry.ts`](https://github.com/vercel-labs/skills/blob/a4d243c3d4f86cdf9385dd1b6a0733f6937e70b5/src/telemetry.ts#L73-L136)）。现有 Copilot 调用本来就使用 `--allow-all-urls` 和 `shell,read,write`（`.github/actions/run-review-pass/action.yml:68-75`），所以 skill 指令被注入后可影响这些已授权工具的使用。Copilot 官方也警告：对未审核 skill 预授权 shell 可导致任意命令执行（[official warning](https://github.com/github/docs/blob/c7be46d7b7d4439956d55263cbf2346fcf02c8b5/data/reusables/copilot/creating-adding-skills.md#L53-L80)）。
- **权限/secret：** 把安装步骤放在注入 `COPILOT_GITHUB_TOKEN` 的 Copilot step 之前，且不给安装 step 传任何 secret。安装公开仓库不需要 `GH_TOKEN`。
- **优先级：** Copilot 对同名 skill 按“项目 `.github/skills`→项目 `.agents/skills`→项目 `.claude/skills`→个人目录”优先级取第一个（[official priority table](https://github.com/github/docs/blob/c7be46d7b7d4439956d55263cbf2346fcf02c8b5/content/copilot/reference/copilot-cli-reference/cli-command-reference.md#L934-L949)）。因此安装到 `~/.copilot/skills` 不能防止 PR head 自带的同名项目 skill 覆盖它。这与本仓库现有“同仓库分支可修改 workflow/prompt，且单维护者接受”的 threat model 一致（[`scripts/src/ai-review/README.md`](../../scripts/src/ai-review/README.md)）；若未来支持外部贡献者，必须同时重新设计这个信任边界，不能把本次 setup 当作隔离措施。
- **供应链/可重现性：** 本次接受 `skills@latest` 和 `mattpocock/skills` 浮动 `main`，与现有未固定版本的 `npm install -g @github/copilot` 保持同样策略。代价是上游发布可以在未修改本仓库的情况下改变 review 行为；若后续需要可重现构建，再固定 installer、skill source 和 Copilot CLI 版本。

## 实测证据

在空的临时 HOME/工作目录中，用 Node 24、`skills` CLI 1.5.22 和 `mattpocock/skills` commit `84fdeffd12f2ee307994d1eb6feb48173b6e0502` archive 执行了与上述等价的命令：

1. `CI=1` + 外层 `npx --yes` + 内层 `skills --yes` 全程没有等待输入；
2. `--skill '*' --agent github-copilot --copy` 安装成功 35/35，包含 `setup-matt-pocock-skills`；
3. GitHub Copilot CLI 1.0.79 的 `copilot -C <cwd> skill list --json` 发现 35/35，且本机 `~/.agents/skills` 的已有 skill 也被标记为 `personal-agents` 来源。

这个实测验证了“非交互安装→指定路径→Copilot 发现”链路；真实 GitHub Actions 的剩余验收项是下载耗时/稳定性和 skill 对现有 review 输出契约的影响。
