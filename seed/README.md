# 种子卡片(Seed Deck)

按 `初稿` 第 10、11 节的内容标准编写。每个场景一个 JSON 文件,可单独导入,也可合并成一个牌组。

## 文件与数量

| 文件 | 场景标签 | 卡数 | 说明 |
|---|---|---|---|
| `email.json` | `email` | 22 | 写邮件 |
| `slack.json` | `slack` | 21 | Slack / Teams 快回 |
| `meeting-disagree.json` | `meeting-disagree` | 20 | 会上表达不同意 |
| `chasing.json` | `chasing` | 20 | 催进度 |
| `asking-help.json` | `asking-help` | 20 | 请人帮忙 |
| `presenting.json` | `presenting` | 20 | 做汇报 |
| `small-talk.json` | `small-talk` | 21 | Small talk |
| `culture.json` | `culture` | 13 | note(文化笔记)9 张 + listen(听力外链)4 张 |

共 **157 张**:produce 96、pick 28、register 20、note 9、listen 4。

## 卡片格式

所有卡片带唯一 `id`(`场景-序号`),导入时用于去重。字段随卡型不同:

```jsonc
// produce —— 看中文情境,说出英文,翻面自评
{ "id": "email-01", "type": "produce", "scene": "email",
  "prompt": "中文情境描述", "answer": "英文答案", "note": "语气与场合解释" }

// pick —— 选出自然的说法
{ "id": "slack-15", "type": "pick", "scene": "slack",
  "prompt": "中文情境",
  "options": [ { "text": "……", "correct": false }, { "text": "……", "correct": true } ],
  "note": "为什么错的错、对的对" }

// register —— 同一意思的三档语气
{ "id": "meeting-disagree-17", "type": "register", "scene": "meeting-disagree",
  "situation": "中文情境", "soft": "……", "neutral": "……", "firm": "……",
  "note": "什么场合用哪档" }

// note —— 纯阅读文化笔记,不评分不进复习队列
{ "id": "culture-01", "type": "note", "scene": "culture",
  "title": "标题", "body": "正文" }

// listen —— 外链听力,v1 不做内置音频
{ "id": "culture-10", "type": "listen", "scene": "culture",
  "title": "标题", "source": "节目名", "url": "入口链接(失效可直接搜节目名)",
  "task": "听什么、听多久", "questions": [ "理解问题(考言外之意)" ] }
```

## 内容口径

- 英式拼写和用法(organise、diary、chase)。
- note 只解释语气、场合、强弱对比,不做翻译。
- 场景优先金融运营:corporate actions、券商后台、对客沟通、对 custodian / broker / registrar 的往来。
- 参照物是真实英国办公室的 Slack 和邮件,不是商务英语教材。

## 合并成单一牌组

```sh
jq -s 'add' seed/*.json > deck.json
```
