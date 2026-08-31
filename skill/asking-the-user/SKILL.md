---
name: asking-the-user
description: The recipe for asking someone good questions when a creative brief is fuzzy — structured single-select choices, one at a time, each shaped by the last answer, always with an easy way out. Use whenever you need direction from the person instead of guessing, especially during creative-director discovery.
---

# Asking the user well

When a request is vague and you genuinely need direction, don't type a paragraph of
open questions and don't guess blindly. Ask the way a good creative director does:
**one sharp multiple-choice question at a time.** This is the "ask_user recipe" the
`creative-director` skill leans on.

## When to ask (and when not to)

**Ask** only when the answer changes what you'd make and you can't infer it:
- The person said they're unsure ("no idea," "help me," "something cool").
- A real fork exists (on-camera vs faceless, ad vs story) with no default.

**Do NOT ask** when:
- The request is already concrete — "three images of a cat" needs zero questions.
  Just make it. (See Step 0 of `creative-director`.)
- A sensible default exists. Pick it, say what you picked, let them redirect. One
  stated default beats one more question.
- You've already asked ~3 questions. Stop, propose something concrete, and let them
  react to that instead.

Cost of a bad question is real: every extra question is a chance for the person to
disengage. Bias toward proposing.

## The shape of a good question

- **Single-select, 4–6 options.** Each option is a short label plus one line of
  what it means — concrete, not abstract ("Faceless & visually striking — no
  on-camera creator, just strong imagery and a clever reveal", not "Option 1").
- **One question per turn.** Don't stack three questions in one message.
- **Adaptive.** Generate the next question from the last answer — don't run a fixed
  script. If they chose "stop the scroll," the next question is about hook/material,
  not about, say, corporate branding.
- **Always an easy way out.** Every question includes:
  - a **"Choose for me"** option (they defer the decision to you — then you pick and
    proceed), and
  - a **"something else / not quite"** option (they redirect in their own words).
- **Narrow fast.** Aim to have enough after ~3 questions. Goal → material → feeling
  is usually plenty.

## A good chain (creative discovery)

1. **What should it do for you?** tell a story / set a mood / stop the scroll /
   explain something / promote something / surprise me.
2. **What kind of material?** faceless & visual / you on camera / built around a
   product / a tiny fiction / something useful.
3. **What feeling should it have?** unsettling-but-beautiful / funny / warm & human
   / fast & thrilling / dreamlike / choose for me.

After that, stop and propose a concept. Don't keep drilling.

## How to actually present it (agent-agnostic)

Use whatever structured-question UI your host gives you — the recipe is the same
everywhere:
- **Claude Code / Claude**: the `AskUserQuestion` tool — one question, 2–4 labeled
  options with descriptions. Put "Choose for me" as an option; the free-text "Other"
  covers "something else." For a longer picklist, list the options in your message
  and let them reply with a number.
- **Codex / Gemini Antigravity / other agents**: present a numbered list and ask
  them to reply with a number (and add "N. Choose for me" and "N. Something else").

Either way: label + one-line description per option, one question at a time, and
always the two escape options.

## When they pick "Choose for me"

Make the choice yourself using taste and what you already know, say which option you
took and why in one line, and move on. Never bounce it back with another question.

## After discovery

Hand the answers to the `creative-director` skill's Step 2 — turn them into one
concrete concept and let the person react to that. Reacting to a real proposal is
faster and better than answering more questions.
