---
title: 诗歌
---

<div id="video-list"></div>

<script>
fetch("/.netlify/functions/videos")
  .then(r => r.json())
  .then(videos => {
    const container = document.getElementById("video-list");

    videos
      .sort((a,b)=> new Date(b.lastModified) - new Date(a.lastModified))
      .forEach(v => {
        const video = document.createElement("video");
        video.src = v.url;
        video.controls = true;
        video.style.width = "100%";
        video.style.marginBottom = "2rem";

        container.appendChild(video);
      });
  });
</script>
