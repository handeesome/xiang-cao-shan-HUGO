# 音频段落高亮数据生成

脚本使用 `faster-whisper` 在本地识别音频，再将识别结果与 Markdown 原文按顺序进行模糊匹配，生成段落级时间戳。识别文字只用于定位，不会显示在网站上。

## 文件结构

音频根目录需要采用以下结构：

```text
audio/
└─ 效法基督/
   └─ 01/
      └─ 1.mp3
```

它对应 `content/books/效法基督/` 下 Markdown 中的：

```text
{{< audio src="01/1.mp3" >}}
```

## 第一次安装

建议使用 Python 3.11，并为脚本建立独立环境：

```powershell
py -3.11 -m venv .venv-audio-sync
.\.venv-audio-sync\Scripts\python.exe -m pip install -r scripts\requirements-audio-sync.txt
```

`faster-whisper` 会通过 PyAV 读取 MP3，通常不需要另外安装 FFmpeg。第一次真正识别时会自动下载所选 Whisper 模型；模型之后保存在 `.audio-sync-cache/models/`，可重复使用。

常用模型：

- `base`：下载小、CPU 较快，适合先试跑；
- `small`：中文识别更稳，推荐正式批量生成；
- `medium`：更准确，但下载、内存占用和运行时间明显增加。

这个项目最终使用原文做模糊对齐，因此不要求识别稿每个字都正确。没有 NVIDIA GPU 也能运行，脚本会自动使用 CPU `int8`。

## 先扫描，不做识别

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "效法基督" `
  --scan
```

扫描会检查每个 shortcode 是否能在 `audio/<书名>/<src>` 找到文件。

## 先处理一页

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "效法基督" `
  --page "scroll1/01_02_效法基督_论自卑" `
  --model base
```

这会生成 JSON 和 `.audio-sync-cache/last-report.json`，但不会修改 Markdown。检查报告后，加上 `--write` 才会把 `sync="..."` 写入 audio shortcode：

`--page` 接受书籍目录内的相对路径或文件名前缀；例如 `一月` 只匹配 `一月.md`，不会同时匹配 `十一月.md`。

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "效法基督" `
  --page "scroll1/01_02_效法基督_论自卑" `
  --model base `
  --write
```

## 处理整本书

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "效法基督" `
  --model small `
  --write
```

脚本会缓存识别稿并跳过已有同步 JSON。需要重新对齐时使用 `--force`；连语音识别缓存也需要重做时，再加 `--force-transcribe`。

处理全站必须显式传入 `--all`，避免误操作近两千条音频：

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --all `
  --model small `
  --write
```

## 移到另一台机器

另一台机器需要：

1. 这个 Git 项目；
2. `audio/书名/src路径` 结构的音频文件夹；
3. Python 3.11；
4. 首次安装依赖和下载模型所需的网络。

如果另一台机器不能联网，Python 环境最好仍在目标机器上重新安装；模型可以提前复制 `.audio-sync-cache/models/`，或者把本地模型目录直接传给 `--model`。
