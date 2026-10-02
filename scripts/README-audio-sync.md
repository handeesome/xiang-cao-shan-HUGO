# 音频段落高亮数据生成

脚本使用 `faster-whisper` 在本地识别音频，再将识别结果与 Markdown 原文按顺序进行模糊匹配，生成段落级时间戳。

识别文字只用于定位，不会显示在网站上。

## 文件结构

音频根目录采用以下结构：

```text
C:\Users\Administrator.it-202407191741\Desktop\香草山\audio\

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
C:\Users\Administrator.it-202407191741\Desktop\香草山\audio\<书名>\<src>
```

找到对应的音频文件。

目前以 `父母之道` 为默认示例：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "C:\Users\Administrator.it-202407191741\Desktop\香草山\audio" `
  --book "父母之道" `
  --scan
```

---

## 先处理一页

目前测试页面：

```text
父母之道/01_第一章 呼召.md
```

对应命令：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "C:\Users\Administrator.it-202407191741\Desktop\香草山\audio" `
  --book "父母之道" `
  --page "01_第一章 呼召" `
  --model ".audio-sync-cache\models\small"
```

这会生成 JSON 和：

```text
.audio-sync-cache/last-report.json
```

但不会修改 Markdown。

检查报告后，加上 `--write` 才会把：

```text
sync="..."
```

写入 audio shortcode：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "C:\Users\Administrator.it-202407191741\Desktop\香草山\audio" `
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
  --audio-root "C:\Users\Administrator.it-202407191741\Desktop\香草山\audio" `
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

## 处理全站

处理全站必须显式传入：

```text
--all
```

避免误操作大量音频。

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "C:\Users\Administrator.it-202407191741\Desktop\香草山\audio" `
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
