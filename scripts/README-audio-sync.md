# 音频段落高亮数据生成

脚本使用 `faster-whisper` 在本地识别音频，再将识别结果与 Markdown 正文整体按顺序对齐，生成段落级时间戳。标题不参加匹配，也不高亮；页面索引仍保留标题的位置，因此正文不会因跳过标题而指向错误元素。

对齐时用 OpenCC 统一识别稿和原文的繁简体，网站仍显示原文。除了整体匹配分数，每段还检查段首、段尾的文字覆盖和连续文字锚点；片头、片尾中离正文很远的零散匹配不能决定时间。脚本不再用下一段起点填满上一段的高亮区间。

新版核验会保留不确定性：缺乏连续文字证据，或者只有整句时间且正文从句子中间开始时，边界标为未核验，而不是当作准确时间。默认不会把这类候选写进网站或覆盖现有 sync。

识别文字只用于定位，不会显示在网站上。

## 新书与新增音频的固定工作流

每一批新 sync 都需要验收，但不是每份都需要再修复一轮。新版生成器已包含段首、段尾和连续锚点核验；只有发现问题时才进入修复。此流程是项目约定，根目录 `AGENTS.md` 要求后续任务先阅读本文，不依赖某个对话的历史。

1. **先确定最终音频和正文。** 如需裁剪片头或片尾，先完成裁剪，再生成对应识别稿与 sync。确认书名、`src`、录音版本和正文段落结构；裁剪前的时间戳不可用于裁剪后的录音。
2. **先试一页，再跑一本书。** 扫描音频映射，使用当前脚本生成；首次不加 `--write`。模型和依赖安装见后文。生成后及时保存本轮报告，避免下一次运行覆盖 `last-report.json`。
3. **按报告状态分流，不直接全量修复。** 查看每个任务、`warnings`、缺 cue 和 `quality` 中的独立边界证据。`needs_review` 的候选留在本地，不能当作已经发布的 JSON；`cached` 也不等于重新核验通过。
4. **只处理有问题的项目。** 新音频尚无已发布 JSON 时，核对并修正文稿或识别稿，再用 `--force` 在这一页或明确选定的清单内重新生成；识别稿正确时不用重跑 Whisper。已有 sync 则先 `--audit`，适合保留旧时间的部分修复才用 `--repair`。不使用全站 `--allow-unverified`，不靠提高分数或清警告通过。
5. **确认缺文后补正文。** 对照录音、上下文及可信原文，属于正文的缺文补入 Markdown，再重新对齐受影响的音频。不要照搬 ASR 错字，不补入无关片头、片尾或音乐。识别稿不能确定的地方保留待核对项。
6. **核对数据、页面和录音。** 检查时间有限且有效、按播放时间排序、不重叠、不超出音频，正文目标唯一且存在，标题不高亮，并检查缺 cue。对照 Hugo 生成 HTML，确认 `targetIndex` / `targetText` 能定位实际正文；引文分段、列表和 `<<书名>>` 尤其要看。至少试听每个文件开头、章节切换和最后一段，所有可疑边界另行核对。纯文本核验不能代替试听。
7. **验收后接入，逐书确认再提交。** 通过检查的任务才加 `--write`，在本地验证播放和高亮，再运行回归测试与 Hugo 构建。汇报真实变化和剩余不确定项；“部分修复”不是“整本通过”。只在用户明确确认后 commit，不自动 push 或部署。

没有旧 JSON 的 `needs_review` 任务不适用 `--repair`。这个参数需要已有 sync 作为保留旧边界的依据；直接对候选运行它，既不能补出可靠的旧时间，也不能证明候选正确。只有逐条试听确认后，才可在明确选定的任务上使用 `--allow-unverified`，并保留复核标记。

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
2. 逐条检查 `warnings` 中的 `incomplete start`、`incomplete end`、`unverified start anchor`、`unverified end anchor`、`low confidence` 和 `unmatched`。即使整体分数高，段首段尾证据不足也会报告。识别稿错字、数字写法差异和未转写语音都可能产生提示，需要对照录音确认；不能仅根据低置信度数量为零来判定通过。
3. 至少试听每个文件的开头、章节或小标题切换处，以及最后一段，确认高亮不会在半句话或半个字中切换。
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
