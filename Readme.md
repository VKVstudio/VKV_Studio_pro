# VKVstudio.pro

I'm Valerii Karpov. I build and review websites and applied AI systems. VKVstudio.pro is where I turn the questions from that work—and changes in AI, search and web technology—into English-language briefings for business decisions.

My aim is to help a reader choose a useful next step:

| Decision | What I mean |
| --- | --- |
| **Act** | There is a supported reason to make a specific change. |
| **Watch** | The change matters, but evidence, availability or timing still needs attention. |
| **Skip** | There is no supported reason to spend resources on it now. |

These are editorial judgements. I show the evidence and limits behind them.

## How I work

I start with primary sources and cite them beside the relevant claims. I distinguish what a publisher announced, what I tested, what I estimate and what remains unknown. Dates matter. A lab result stays attached to the measured page, date and conditions.

I use skeptical review to challenge the sources, claims and practical recommendation. The implication comes before a service link; a briefing should be useful on its own.

## Project structure

My workspace separates the public frontend from a private editorial backend.

| Part | Current role |
| --- | --- |
| `frontend-nuxt/` | Nuxt 4 and Vue frontend, generated as static pages: briefings, archive search, editorial method and studio pages. |
| `backend/` | Offline Python editorial backend for sources, claim ledgers, drafts, review stages and explicit owner decisions. Production authentication and provider integration remain pending. |
| `automation/n8n/` and `backend/workflows/` | Inactive n8n scaffolds for manual draft and review stages. A workflow result does not authorize publication. |

The repository contains **eight reviewed English briefings** and their backend-approved contract v2 exports in `frontend-nuxt/content/approved/`. I've accepted their skeptical editorial review. Public generation validates the exact article collection and media release approval before it creates published pages.

Live provider connections and runtime credentials are also pending. When I provision n8n, I enter provider keys directly into its encrypted server-side Credentials store. I keep secrets out of browser bundles, source, workflow JSON and execution data. The current scaffolds do not publish the site or send email or social posts.

## Run locally

Use Node.js 24 and the project's pinned **pnpm 10.34.1**. In my full workspace, the frontend is in `frontend-nuxt/`:

```bash
cd frontend-nuxt
pnpm run dev         # http://127.0.0.1:4322
```

In a standalone frontend checkout, run the pnpm commands from its root. For a generated local review build:

```bash
pnpm run typecheck
pnpm run build
pnpm run preview     # http://127.0.0.1:4323
```

The default build is a review build. Public generation has a separate signed editorial release gate; a successful local build does not complete that release.

## Work with me

My commercial work lives at [VKVstudio.com](https://vkvstudio.com/en/). [Services and pricing](https://vkvstudio.com/en/services/) describe the current scope; [Trust & Process](https://vkvstudio.com/en/trust/) explains how I agree and deliver work.

For a project, start with a [written enquiry](https://vkvstudio.com/en/contact/). Describe the task, documents or website, and the constraints that matter. Project correspondence is in English. I agree the questions, scope, proposal and approval in writing; no introductory call is required.
