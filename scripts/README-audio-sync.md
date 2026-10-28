# 音频段落高亮数据生成

音频同步以段落为单位。核验时优先复用与当前录音一致的词级识别稿，定位每段实际朗读的开头和结尾；缺少合适识别稿时才按明确清单补跑局部识别。标题不参加匹配，也不高亮；页面索引仍保留标题的位置，因此正文不会因跳过标题而指向错误元素。

核验重点是首尾短句及其时间。整段匹配用于粗定位，或在重复语句、片头引用、错序等歧义出现时辅助确认身份。中间识别错字、同义表达或整段相似度低，不能单凭这些否决已有首尾证据。保留原始置信度与警告，不为通过检查而提高分数或删除提示，也不用下一段起点冒充本段真实终点。

识别文字只用于定位，不会显示在网站上。缺少可靠边界证据的候选默认保留在本地，不当作精确时间覆盖旧 sync。

## 新书与新增音频的固定工作流

每一批新 sync 都需要验收，但不是每份都需要再修复一轮。每本书单独生成、核验、修复和记录，只有发现问题时才进入修复。根目录 `AGENTS.md` 要求后续任务先阅读本文，不依赖其他对话的历史。

1. **先确定最终音频和正文。** 确认书名、`src`、录音版本、时长和裁剪情况；裁剪前的时间不能用于裁剪后的录音。修改前保留可恢复版本。
2. **先试一页，再跑一本书。** 首次生成不加 `--write`，及时保存报告。优先使用已提供的 transcripts；不因模型名为 small 就升级到 medium，也不把本机缺缓存当作重识别整本书的理由。
3. **先核对首尾，再处理具体疑点。** 查看缺 cue、局部首尾证据、段落身份及时间冲突。`pending`、`startVerified=false`、`endVerified=false` 或字段缺失，只表示尚未确认，不能直接转换成模型重跑队列。先利用已有识别稿和上下文区分识别差异、未读标签、摘读、正文范围和真实错配；只有现有证据不能排除具体歧义时才补跑局部窗口，并记录原因、目标短句和时间范围。不要求正文中间逐字一致。
4. **只修复有问题的项目。** 已有 sync 的部分修复才使用 `--repair`，只替换有证据的边界。新音频没有旧 JSON 时先解决正文或识别稿问题，再正常生成。不批量使用 `--allow-unverified`，不吞掉相邻正文，不猜测段落身份。
5. **确认缺文后补正文。** 用户授权且确认录音中属于正文的缺文后，补入 Markdown 并重新对齐；不把片头、音乐、识别错字或听不清内容补作正文。未朗读的文字不强造 cue。
6. **逐书核验，共用有效构建。** 检查有效范围、时间顺序、重叠、缺 cue、标题排除及实际 HTML 的 `targetIndex` / `targetText` 对应。批次开始或正文变化时运行回归和 Hugo 构建；只改 JSON 时复用有效构建，刷新对应的发布 JSON 副本并核对哈希。Hugo 将 `static/audio-sync/` 发布为构建目录的 `audio-sync/`。正文变化、HTML 过期或目标不符时必须重建；不为每个局部窗口重复全站验收。录音抽听关注开头、章节切换、末尾和具体疑点；纯文本检查不能宣称已经试听。
7. **完成后汇总，确认再提交。** 连续处理全部剩余项时，内部逐书保留记录，完成后统一汇报。文件数、段落数和边界数分别统计，不把历史警告数称作未修复文件数。只在用户明确确认后 commit；push 或部署需要相应授权。保留与本轮任务无关的修改，缓存、MP3、模型、transcripts 及临时报告不加入 Git。

没有旧 JSON 的 `needs_review` 任务不适用 `--repair`。命令成功、`cached` 或 Hugo 构建通过都不能单独证明时间正确。已有候选仍带不确定性时，按实际证据和用户授权的精度标准处理。

### 用户明确要求段落首尾大致对应时

对已有 sync，用户明确接受段落级近似时间、同义读法或摘读时，以实际朗读的首句、末句和相邻段落身份作判断。优先复用与当前音频一致的识别稿；不要因为严格核验字段为假、作者音译不同、印刷出处未读或中间省略，就要求逐字一致、两个模型一致或重新识别全文。只有现有证据无法排除重复短句、串段或时间异常时，才补跑明确的局部窗口。

这种授权允许应用有上下文依据的近似边界，不等于严格词级核验通过。逐 cue 用 `paragraphTimingReview` 保存实际采用时间、原时间、判断理由、识别稿来源和哈希；保留原置信度、警告和严格核验历史。若移动了旧的已核验边界，撤回不再适用的严格标记，不把近似判断写成 `verified=true`。没有实际试听时继续记录 `listenedByAgent=false`。

先检查同段出处、署名和“请读……”提示的归属，再同时核对相邻 cue；不能把重复提示当作经文起点，也不能把下一段起点直接当作本段末尾。确实未朗读的段落不造 cue，使用 `paragraphTimingExclusions` 记录目标、原因及证据；录音截断或缺少后半音频同样单列。已完成段落级处理的项目与严格核验提示分开统计，不能把历史警告数重新称作尚未修复的文件数。后续发现新证据、音频版本或正文变化时才重新打开对应项目。

此模式仍需备份、时间顺序和范围检查、实际 HTML 目标检查及逐书汇总。只改 JSON 时复用当前有效的 Hugo 构建；不以重复建站或制作试听页面作为继续修复的条件。默认生成及 `--repair` 的严格判据保持原样，不能通过批量 `--allow-unverified` 模拟上述人工判断。

### 常用命令（每本书单独执行）

下面用 `新书` 作目录名示例。先生成而不修改 Markdown：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "D:\audio" --book "新书" --scan
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "D:\audio" --book "新书" --model small
```

对已经生成的 JSON 用同一批缓存识别稿做只读审计（没有发布 JSON 的候选先按上面的第 4 步处理）：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "D:\audio" --book "新书" --audit
```

已有 sync 需要部分修复时，先备份或确认 Git 中有可恢复版本，再限定到相关页面：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "D:\audio" --book "新书" --page "章节文件名前缀" --repair
```

从另一台电脑接收结果时，应提供对应的 transcripts，使用后文的 `--transcript-root` 或 `--transcript-manifest`。不要为了本机缺缓存而重新识别整本书；也不要认为所有电脑都能访问同一绝对路径。

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\test_generate_audio_sync.py
node --test scripts/audio-text-sync.test.cjs
hugo --destination .tmp/audio-sync-review-build
```

Hugo 构建成功只是验收的一部分，不自动证明 cue 的语义对应或听感正确。

### 工作流、报告与跨对话保存

- `AGENTS.md`：给后续项目任务的简短约定与文档入口。
- 本文：可复用流程、命令和验收标准；主 `README.md` 保留入口。
- `.audio-sync-cache/`：本机识别稿、报告、候选和备份，不随 Git 自动同步。需要交接时另外提供，不能假设新对话或另一台电脑已经拿到。

文档和脚本提交进仓库、另一台电脑 pull 后，就能依项目文件执行流程，而不必找回旧对话。换对话时只需说明本次书名、音频根目录、transcripts 位置及任务是“仅核验”还是“修复”。发现新问题时同步更新规则与回归测试，不把当次机器路径和统计数写成长期规则。

## 文件结构

音频根目录采用以下结构：

```text
D:\audio\

└─ 父母之道/

   └─ 01/

      └─ 1-1.mp3
```

它对应 `content/books/父母之道/` 下 Markdown 中的：

```text
{{< audio src="01/1-1.mp3" >}}
```

---

## 第一次安装

建议使用 Python 3.11，并为脚本建立独立环境：

```powershell
py -3.11 -m venv .venv-audio-sync

.\.venv-audio-sync\Scripts\python.exe -m pip install -r scripts\requirements-audio-sync.txt
```

`faster-whisper` 会通过 PyAV 读取 MP3，通常不需要另外安装 FFmpeg。

### Whisper 模型

本项目使用 `faster-whisper` 的 CTranslate2 模型。

如果已经手动下载了 `small` 模型，推荐放在：

```text
.audio-sync-cache/
└─ models/
   └─ small/
      ├─ config.json
      ├─ model.bin
      ├─ tokenizer.json
      └─ vocabulary.txt
```

然后使用：

```text
--model ".audio-sync-cache\models\small"
```

这样会直接使用本地模型，不需要从 Hugging Face 下载。

如果模型放在其他位置，也可以把 `--model` 指向该模型目录。

> 注意：仅有 `model.bin` 通常是不完整的。需要完整的 CTranslate2 模型目录，包括配置和 tokenizer 等文件。

常用模型：

- `base`：下载小、CPU 较快，适合先试跑；
- `small`：中文识别更稳，推荐正式批量生成；
- `medium`：更准确，但下载、内存占用和运行时间明显增加。

这个项目最终使用原文做模糊对齐，因此不要求识别稿每个字都正确。

没有 NVIDIA GPU 也能运行，脚本会自动使用 CPU `int8`。

---

## 先扫描，不做识别

扫描会检查每个 shortcode 是否能在：

```text
D:\audio\<书名>\<src>
```

找到对应的音频文件。

以下以 `父母之道` 为示例：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "父母之道" `
  --scan
```

---

## 先处理一页

例如先测试一个页面：

```text
父母之道/01_第一章 呼召.md
```

对应命令：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "父母之道" `
  --page "01_第一章 呼召" `
  --model ".audio-sync-cache\models\small"
```

边界核验通过时会生成网站使用的 JSON，以及：

```text
.audio-sync-cache/last-report.json
```

但不会修改 Markdown。如果存在未核验边界或未匹配的正文，只在 `.audio-sync-cache/proposals/` 保存候选，退出码为 `2`；网站使用的 sync 和 Markdown 保持不变。

检查报告后，加上 `--write` 才会把：

```text
sync="..."
```

写入 audio shortcode：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "父母之道" `
  --page "01_第一章 呼召" `
  --model ".audio-sync-cache\models\small" `
  --write
```

### `--page` 的匹配规则

`--page` 接受书籍目录内的相对路径或文件名前缀。

例如：

```text
--page "一月"
```

只匹配：

```text
一月.md
```

不会同时匹配：

```text
十一月.md
```

---

## 处理整本书

处理 `父母之道` 整本书：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "父母之道" `
  --model ".audio-sync-cache\models\small" `
  --write
```

脚本会缓存识别稿并跳过已有同步 JSON。

需要重新对齐时使用：

```text
--force
```

如果连语音识别缓存也需要重新生成，再加：

```text
--force-transcribe
```

---

## 生成后的验收

生成结果需要人工检查，不能只根据命令成功退出就直接提交。

1. 查看 `.audio-sync-cache/last-report.json`，确认没有失败的任务或找不到的音频。
2. 按固定工作流核对未确认的首尾、段落身份、时间冲突及缺 cue。整段低分保留为诊断，不单凭中间识别差异安排全文重识别；整体高分或警告数量为零也不能代替首尾证据。
3. 默认抽听每个文件的开头、章节或小标题切换处及最后一段，具体疑点另行核对。用户已明确接受段落级近似时间时，按前述对应标准处理和记录；没有实际试听就不宣称已经听过。
4. 用 Hugo 构建网站，确认 Markdown 中的每个 `sync` 路径都有对应的 JSON。
5. 逐书确认后提交 `static/audio-sync/` JSON、Markdown 中的 `sync` 属性，以及经核对的正文修复。可复用脚本、测试和流程文档也可单独提交。不要提交 MP3、模型、识别稿、`.audio-sync-cache/` 或虚拟环境。

如果某段录音比网页正文多或少，不要为了让警告消失而强行匹配；先确认录音实际朗读了什么，再决定修正文稿、调整 cue，或保留为未匹配内容。

报告包括 `warningCount`、`jobsRequiringReview` 和 `withheldJobCount`。`status="needs_review"` 表示边界未核验或正文未匹配，候选尚未发布，`proposal` 给出候选文件的位置；即使指定 `--force --write`，这类任务也不会覆盖旧 sync 或写入 Markdown。

JSON 中的 `quality` 记录每段的覆盖情况、`startVerified`、`endVerified` 和边界证据，`boundaryAdjusted` 记录剔除孤立匹配或局部识别替换的情况。`alignmentWarnings` 保存提示，复用已有 JSON 时提示不会消失。只识别到零碎片段的正文不会生成 cue。

如果已经逐条试听确认候选的边界可用，可以在原生成命令后显式加 `--allow-unverified`。这个选项允许发布仍带复核标记的候选，不会消除提示或把边界改成“已核验”；不要为了让批处理顺利退出而盲目添加。通常应先修复识别稿、正文或匹配问题，再正常重新生成。

### 使用已有 transcripts

不必重新运行 Whisper。若文件结构为 `D:\transcripts\历史书\Judges1-2.mp3.json`，且对应 Markdown 中 `src="Judges1-2.mp3"`，可以直接用：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "D:\audio" --book "历史书" --transcript-root "D:\transcripts\历史书" --force
```

`--transcript-root` 指向这一本书的识别稿目录；嵌套的 `src="01/1.mp3"` 则需要该目录下的 `01/1.mp3.json`。缺失识别稿会报错，不会偷偷启动转写。这里 `--audio-root` 仍是必填的音频根目录，但使用识别稿时不需要当地 MP3 存在。

### 跨书使用已选择的识别稿

识别稿分散在不同目录时，可以准备一个 JSON 清单，限定需要更新的音频，并明确给出每份识别稿的路径：

```json
{
  "jobs": [
    {
      "book": "效法基督",
      "page": "scroll1/01_02_效法基督_论自卑.md",
      "audio": "01/1.mp3",
      "transcript": "C:/transcripts/效法基督/01/1.mp3.json"
    }
  ]
}
```

`page` 是书籍目录内的 Markdown 相对路径，`audio` 必须与对应 shortcode 的 `src` 完全一致。`transcript` 可以是绝对路径或相对清单文件的路径。清单中的任务必须都在选中的内容中找到；没有列出的音频不会被处理。

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "." --all --transcript-manifest ".audio-sync-cache\selected-transcripts.json" --force
```

这个模式不需要本地 MP3，不启动 Whisper，不下载模型。缺失的识别稿会报告错误，不会转而重新转写；识别稿与现有 sync 的音频时长相差超过 1 秒时也会保留旧文件并报告错误。它与 `--transcript-root`、`--force-transcribe` 互斥。普通命令在当前终端运行；需后台运行时，应另用本机启动器并保存输出日志，同时保持电脑不进入睡眠。

### 审计已有 sync

加 `--audit` 可以对照识别稿检测旧 cue 是否开始过晚、结束时间偏离、标题抢占正文、cue 缺失或目标错误。这个模式不改 sync JSON 和 Markdown，也不运行语音识别：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "D:\audio" --book "历史书" --transcript-root "D:\transcripts\历史书" --audit
```

审计报告为 `.audio-sync-cache/last-audit-report.json`；退出码 `0` 表示没有提示，`1` 表示任务失败，`2` 表示有待复查项。审计只有在参考边界通过连续文字核验时，才报告“开始/结束时间偏离”；证据不足时明确报告未核验并跳过对应时间比较，避免把错误的新匹配当作修复依据。如果识别稿与 sync 记录的音频时长相差超过 1 秒，也跳过时间比较并提示可能使用了裁剪前的缓存。

报告是文本对齐检查，不替代试听。已有旧版 JSON 不会自动重生成；需要查看审计结果后用 `--force`。其他机器更新后，先重新安装 `requirements-audio-sync.txt` 以获得 OpenCC 依赖。

### 只修复已有 sync 中有证据的边界

旧文件里只有部分段首或段尾能确认时，可以用 `--repair`，不必为了修好一段而发布整份未核验候选：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py --audio-root "." --all --transcript-manifest ".audio-sync-cache\selected-transcripts.json" --repair
```

运行前先备份 `static/audio-sync/`，或确认 Git 中已有可恢复的版本。此命令会修改清单选中的已有 JSON；没有 `--write` 时不修改 Markdown。不会读取 MP3、运行 Whisper 或下载模型。它不能与 `--force`、`--force-transcribe`、`--audit` 或 `--allow-unverified` 合用。

段首和段尾分别核验：有连续文字及局部边界证据的才替换，其他边界保留旧时间并标记未核验。相邻的已核验边界可以限制旧 cue 的范围，但这种限制不会被当成该段实际朗读边界的证明。若替换会吞掉相邻段落，撤回该替换。旧编号偏移时，只允许在同一音频内按完全相同、唯一的文字签名迁移；合并引文、歧义文本、时长不符及无法消除的重叠会保留整份旧文件并报错。

录音中插入了网页没有的文字时，整体分数可能偏低；只有网页文字的大部分仍有连续匹配、局部段首或段尾也通过核验，才可修复相应边界。原始低分与提示仍保留，不会人为提高分数。正文缺失应核对后修复 Markdown，再重新对齐；不要把片头、片尾、识别错误直接补作正文。

`repairMode`、`repairSummary`、`quality` 和每个 cue 的 `repair` 记录修复与保留的边界；`targetMigrations` 记录旧编号的迁移。报告为 `.audio-sync-cache/last-repair-report.json`。退出码 `2` 表示文件已部分修复但仍有待复核项，`1` 表示有任务失败，不能把“有文件更新”理解成“全部通过”。默认生成流程也会保留带 `reviewRequired` 标记的候选，不发布为已通过结果。

文字解析也保留 Hugo 会显示的 `<<书名或歌名>>`，避免把它误当 HTML 标签删掉，导致 JSON 文字签名和页面不一致。旧文件只有在同一音频内能唯一确认对应原文时才迁移这种签名；不会靠模糊文本匹配更换目标段落。

可用下面的命令运行段落对齐回归测试（不需要 MP3 或 Whisper 模型）：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\test_generate_audio_sync.py
node --test scripts/audio-text-sync.test.cjs
```

---

## 处理全站

处理全站必须显式传入：

```text
--all
```

避免误操作大量音频。

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --all `
  --model ".audio-sync-cache\models\small" `
  --write
```

---

## 移到另一台机器

另一台机器需要：

1. 这个 Git 项目；
2. `audio/书名/src路径` 结构的音频文件夹；
3. Python 3.11；
4. 安装 `requirements-audio-sync.txt` 中的依赖。

如果使用本地 `small` 模型，可以直接复制：

```text
.audio-sync-cache/models/small/
```

到另一台机器。

完整目录应类似：

```text
.audio-sync-cache/
└─ models/
   └─ small/
      ├─ config.json
      ├─ model.bin
      ├─ tokenizer.json
      └─ vocabulary.txt
```

如果另一台机器不能联网，可以提前复制模型，不需要再次从 Hugging Face 下载。

也可以把模型放在其他位置，然后通过：

```text
--model "模型所在目录"
```

直接指定本地模型。
