---
title: "书架"
type: docs
bookToC: false
---

# 香草山书架

<div class="book-filters">
  <label>
    书籍排序:
    <div class="select-wrap">
        <select id="viewMode">
        <option value="default">默认排序</option>
        <option value="title">按标题</option>
        <option value="authorTitle">按作者 + 标题</option>
        <option value="groupByAuthor">按作者（分组）</option>
        </select>
    </div>
  </label>

  <label>
    作者:
    <div class="select-wrap">
        <select id="authorFilter">
        <option value="all">全部</option>
        </select>
    </div>
  </label>
</div>


<div class="book-shelf">
{{< bookcover title="基督是我们的满足" author="约翰达秘" url="基督是我们的满足/" image="images/books/基督是我们的满足.webp" >}}
{{< bookcover title="效法基督" author="托马斯·厄·肯培" url="效法基督/" image="images/books/效法基督.jpg" >}}
{{< bookcover title="倪柝声全集" author="倪柝声" url="倪柝声全集/" image="images/books/倪柝声全集.jpg" >}}
{{< bookcover title="人的破碎与灵的出来" author="倪柝声" url="人的破碎与灵的出来/" image="images/books/人的破碎与灵的出来.png" >}}
{{< bookcover title="隐藏的泉源─雅歌书注" author="宾路易师母" url="隐藏的泉源雅歌书注/" image="images/books/隐藏的泉源──雅歌书注.png" >}}
{{< bookcover title="属天的日子" author="宣信博士" url="属天的日子/" image="images/books/属天的日子.png" >}}
{{< bookcover title="神的心意" author="慕安得烈" url="神的心意/" image="images/books/神的心意.png" >}}
{{< bookcover title="圣灵全备的祝福" author="慕安得烈" url="圣灵全备的祝福/" image="images/books/圣灵全备的祝福.jpg" >}}
{{< bookcover title="耶稣宝血的能力" author="慕安得烈" url="耶稣宝血的能力/" image="images/books/耶稣宝血的能力.jpg" >}}
{{< bookcover title="至圣所" author="慕安得烈" url="至圣所/" image="images/books/至圣所.jpg" >}}
{{< bookcover title="大小先知书" author="小鹿" url="大小先知书/" image="images/books/大小先知书.jpg" >}}
{{< bookcover title="十字架与生命之路" author="史百克" url="十字架与生命之路/" image="images/books/十字架与生命之路.jpg" >}}
{{< bookcover title="十字架的中心性与宇宙性" author="史百克" url="十字架的中心性与宇宙性/" image="images/books/十字架的中心性与宇宙性.jpg" >}}
{{< bookcover title="末世神的工作" author="史百克" url="末世神的工作/" image="images/books/末世神的工作.jpg" >}}
{{< bookcover title="人算什么？" author="史百克" url="人算什么/" image="images/books/人算什么.jpg" >}}
{{< bookcover title="得胜的生命" author="倪柝声" url="得胜的生命/" image="images/books/得胜的生命.jpg" >}}
{{< bookcover title="魂与灵" author="宾路易师母" url="魂与灵/" image="images/books/魂与灵.jpg" >}}
{{< bookcover title="十字架的诀要" author="慕安得烈" url="十字架的诀要/" image="images/books/十字架的诀要.jpg" >}}
{{< bookcover title="永远的十字架" author="倪柝声" url="永远的十字架/" image="images/books/永远的十字架.jpg" >}}
{{< bookcover title="众圣徒的争战" author="宾路易师母" url="众圣徒的争战/" image="images/books/众圣徒的争战.jpg" >}}
{{< bookcover title="各各他的十字架" author="宾路易师母" url="各各他的十字架/" image="images/books/各各他的十字架.jpg" >}}
{{< bookcover title="圣城新耶路撒冷" author="史百克" url="圣城新耶路撒冷/" image="images/books/圣城新耶路撒冷.jpg" >}}
{{< bookcover title="慕安德烈丛书精华录" author="慕安得烈" url="慕安德烈丛书精华录/" image="images/books/慕安德烈丛书精华录.png" >}}
{{< bookcover title="父母之道" author="保罗·区普" url="父母之道/" image="images/books/父母之道.png" >}}
{{< bookcover title="神前有能" author="倪柝声" url="神前有能/" image="images/books/神前有能.jpg" >}}
{{< bookcover title="祈祷出来的能力" author="邦兹" url="祈祷出来的能力/" image="images/books/祈祷出来的能力.jpg" >}}
{{< bookcover title="作完全人" author="慕安得烈" url="作完全人/" image="images/books/作完全人.jpg" >}}
{{< bookcover title="内在生活" author="慕安得烈" url="内在生活/" image="images/books/内在生活.jpg" >}}

</div>


<script>

    const shelf = document.querySelector(".book-shelf")
    const books = [...document.querySelectorAll(".book-cover")]

    const viewMode = document.getElementById("viewMode")
    const authorFilter = document.getElementById("authorFilter")

    // collect unique authors
    const authors = [...new Set(books.map(b => b.dataset.author))].sort((a,b)=>
    a.localeCompare(b,"zh")
    )

    authors.forEach(a=>{
    const opt = document.createElement("option")
    opt.value = a
    opt.textContent = a
    authorFilter.appendChild(opt)
    })

    function render(){

    const mode = viewMode.value
    const selectedAuthor = authorFilter.value

    shelf.innerHTML = ""

    let list = [...books]

    if(selectedAuthor !== "all"){
        list = list.filter(b => b.dataset.author === selectedAuthor)
    }

    const zhCompare = (a, b) => (a || "").localeCompare(b || "", "zh")

    // -------------------------
    // DEFAULT ORDER
    // -------------------------
    if(mode === "default"){
        list.forEach(b => shelf.appendChild(b))
        return
    }

    // -------------------------
    // TITLE ORDER
    // -------------------------
    if(mode === "title"){
        list.sort((a,b)=> zhCompare(a.dataset.title, b.dataset.title))
        list.forEach(b => shelf.appendChild(b))
        return
    }

    // -------------------------
    // AUTHOR + TITLE ORDER (NO GROUP HEADERS)
    // -------------------------
    if(mode === "authorTitle"){
        list.sort((a,b)=>{
            const authorCmp = zhCompare(a.dataset.author, b.dataset.author)
            if(authorCmp !== 0) return authorCmp
            return zhCompare(a.dataset.title, b.dataset.title)
        })
        list.forEach(b => shelf.appendChild(b))
        return
    }

    // -------------------------
    // AUTHOR GROUP VIEW
    // -------------------------
    const groups = {}

    list.forEach(b=>{
        const author = b.dataset.author
        if(!groups[author]) groups[author] = []
        groups[author].push(b)
    })

    const authors = Object.keys(groups).sort((a,b)=> zhCompare(a,b))
    const showHeaders = authors.length > 1 // avoids redundant headers when filtering

    authors.forEach(author=>{
        if(showHeaders){
            const header = document.createElement("div")
            header.className = "book-author-group"
            header.textContent = author
            shelf.appendChild(header)
        }

        groups[author].sort((a,b)=> zhCompare(a.dataset.title, b.dataset.title))
        groups[author].forEach(b => shelf.appendChild(b))
    })

    }

    viewMode.addEventListener("change",render)
    authorFilter.addEventListener("change",render)

</script>