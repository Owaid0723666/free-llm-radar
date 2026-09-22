# free-llm-radar

[English](README.md)

各家大模型接口的免费档每周都在变：有新模型上来，有的改名，有的开始回 429，有的悄悄不再免费。本仓库每天给几家服务商的每个免费模型各问一句很短的话，记下哪些答上来了、用了多久。下面的表格由定时运行的 GitHub Action 自动更新。

## 今天

<!-- radar:start -->
最近一次：2026-09-22 07:42 UTC。23 个模型里 20 个能用。

| 服务商 | 模型 | 最近一次 | 用时 | 最近 7 次 |
| --- | --- | --- | ---: | ---: |
| OpenRouter | `nex-agi/nex-n2.5-mini:free` | 能用 | 0.4s | 2/2 |
| OpenRouter | `nex-agi/nex-n2.5-pro:free` | 能用 | 0.5s | 1/2 |
| OpenRouter | `inclusionai/ling-3.0-flash-fin:free` | 能用 | 0.5s | 2/2 |
| OpenRouter | `inclusionai/ling-3.0-flash-sante:free` | 能用 | 0.6s | 2/2 |
| OpenRouter | `inclusionai/ling-3.0-flash-vl:free` | 能用 | 0.6s | 2/2 |
| OpenRouter | `qwen/qwen3.8-27b:free` | 失败 (HTTP 429) | — | 0/2 |
| Google Gemini API | `gemini-3.1-flash-lite` | 能用 | 0.7s | 2/2 |
| Google Gemini API | `gemini-3-flash-preview` | 能用 | 1.0s | 2/2 |
| Mistral | `ministral-3b-latest` | 能用 | 0.3s | 2/2 |
| Mistral | `codestral-2508` | 能用 | 0.4s | 2/2 |
| Mistral | `ministral-8b-latest` | 能用 | 0.5s | 2/2 |
| Cloudflare Workers AI | `@cf/qwen/qwen2.5-coder-32b-instruct` | 能用 | 0.2s | 2/2 |
| Cloudflare Workers AI | `@cf/meta/llama-4-scout-17b-16e-instruct` | 能用 | 0.3s | 2/2 |
| Cloudflare Workers AI | `@cf/openai/gpt-oss-120b` | 能用 | 1.0s | 2/2 |
| NVIDIA NIM | `nvidia/nemotron-3.5-lightning-30b-a3b` | 能用 | 2.1s | 1/2 |
| NVIDIA NIM | `openai/gpt-oss-20b` | 能用 | 2.7s | 2/2 |
| NVIDIA NIM | `nvidia/nemotron-3-super-120b-a12b` | 失败 (HTTP 503) | — | 1/2 |
| NVIDIA NIM | `mistralai/mistral-nemotron` | 失败 (timeout) | — | 0/2 |
| onomeo | `ministral-8b-latest` | 能用 | 0.6s | 2/2 |
| onomeo | `gemini-3.1-flash-lite` | 能用 | 0.7s | 1/2 |
| onomeo | `@cf/openai/gpt-oss-120b` | 能用 | 0.9s | 2/2 |
| onomeo | `nvidia/nemotron-3-super-120b-a12b` | 能用 | 1.1s | 2/2 |
| onomeo | `deepseek-v4-flash` | 能用 | 3.0s | 2/2 |
<!-- radar:end -->

「最近一次」是今天这次的结果；「最近 7 次」是其中答上来的天数。失败一次不代表模型没了：免费档繁忙时常会回 429。

## 测了哪些

| 服务商 | 模型 | 免费档简介 |
| --- | --- | --- |
| [OpenRouter](https://openrouter.ai) | 模型列表里最新的 6 个 `:free` 模型 | 未充值满 10 美元时每天 50 次免费请求 |
| [Google Gemini API](https://ai.google.dev) | Flash 与 Flash-Lite | 通过 Google AI Studio 提供的免费档；不适用于面向欧洲经济区、瑞士、英国用户的应用 |
| [Mistral](https://mistral.ai) | 小模型 | 免费体验计划，按月给一笔额度 |
| [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) | 3 个文字模型 | 每天 10,000 个免费 neurons |
| [NVIDIA NIM](https://build.nvidia.com) | 4 个模型 | 可免费用于原型开发与研究 |
| [Groq](https://groq.com) | 模型列表里最多 8 个对话模型 | 按模型设每日上限（配好密钥之前暂不测试） |
| [onomeo](https://onomeo.com) | 5 个低消耗模型 | 每日签到领取免费额度，按字数扣除 |

具体模型名见 [providers.json](providers.json)。每次提问的内容是 `Reply with the single word: OK`，`max_tokens` 为 32，不发送其他内容，只保留是否成功、用时和 HTTP 状态码。

## 自己运行

需要 Node 18 或更新版本，无需安装依赖。设置你有的密钥即可，没有密钥的服务商会跳过。

```bash
git clone https://github.com/Owaid0723666/free-llm-radar
cd free-llm-radar
export GEMINI_API_KEY=...        # 下表任意一个
node radar.mjs
```

| 变量 | 获取位置 |
| --- | --- |
| `OPENROUTER_API_KEY` | openrouter.ai/keys |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `MISTRAL_API_KEY` | console.mistral.ai/api-keys |
| `CLOUDFLARE_API_KEY` 与 `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com，创建带 Workers AI 读取权限的令牌 |
| `NVIDIA_API_KEY` | build.nvidia.com |
| `GROQ_API_KEY` | console.groq.com/keys |
| `ONOMEO_API_KEY` | onomeo.com/dashboard |

运行后会改写两份 README 里的表格，并生成 `results/latest.json` 和 `results/history.json`（每个模型保留最近 14 次）。

## 添加服务商

任何兼容 OpenAI 格式的接口都可以，在 `providers.json` 里加一项即可，写法见[英文说明](README.md#add-a-provider)。提交合并请求前请先运行 `npm test`。

## 声明

本仓库由 [onomeo](https://onomeo.com) 的站主维护，onomeo 也是表中的服务商之一。onomeo 与其他服务商用同一句话、同一种方式测试，失败也照样列出。

感谢 [LINUX DO](https://linux.do) 社区，这里用到的许多免费档知识来自社区的分享。

## 许可

MIT
