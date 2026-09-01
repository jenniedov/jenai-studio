# פרומפט לתלמידים — התקנה והרצה

**איך זה עובד:** התלמיד/ה פותח/ת סוכן קוד (Claude Code או GPT Codex) על המחשב, ומדביק/ה את הפרומפט שבמסגרת למטה. הסוכן עושה את הכול לבד: בודק דרישות, מוריד את הקוד, מתקין, ומריץ את האפליקציה על `http://localhost:4317`.

**מה צריך להיות מותקן מראש:** רק **Node.js 18+** ו-**Git**. (ffmpeg זה תוספת לא חובה — רק לתמונות תצוגה של סרטונים.)

**כמה זמן זה לוקח:** ~10–15 דקות בפעם הראשונה (רובו הורדות של Node/Git). אם Node ו-Git כבר מותקנים — 3–5 דקות.

---

## הפרומפט להעתקה (עברית)

> אני רוצה שתתקין לי אפליקציה בשם **JenAI Studio** ותריץ אותה על המחשב שלי. עשה זאת שלב-אחר-שלב, ואל תעבור לשלב הבא לפני שהקודם הצליח. דבר איתי בעברית, והסבר בפשטות אם משהו נכשל.
>
> **1. בדיקת כלים.** הרץ `node --version` (צריך 18 ומעלה) ו-`git --version`. אם אחד מהם חסר — עצור ותגיד לי להתקין: Node מ-https://nodejs.org (גרסת LTS), ו-Git מ-https://git-scm.com . נמשיך אחרי שאתקין.
>
> **2. הורדת הקוד.** הרץ:
> ```
> git clone https://github.com/jenniedov/jenai-studio.git
> cd jenai-studio
> ```
>
> **3. התקנה בפקודה אחת** (מתקינה תלויות ומחברת את ה-MCP של הסטודיו אליך):
> ```
> npm run setup
> ```
>
> **4. הרצת האפליקציה.** הפעל את השרת כך שיישאר לרוץ ברקע, ואז פתח אותו:
> ```
> npm start
> ```
> כשהוא עולה, פתח לי בדפדפן את **http://localhost:4317** .
>
> **5. אישור שהכול עובד.** ודא ש-`http://localhost:4317` עונה. כשזה רץ, תגיד לי "האפליקציה מוכנה" וכוון אותי לפופאפ שמבקש מפתח ספק (Oxen או Kie). אם אין לי מפתח — הסבר לי איך משיגים חינם.
>
> אם קרתה שגיאה באחד השלבים — הצג לי אותה, הסבר בפשטות מה הבעיה, ונסה לתקן. אל תדלג על שלב שנכשל.

---

## The prompt (English)

> Install an app called **JenAI Studio** on my machine and run it. Do it step by step, and don't move to the next step until the current one succeeds. If something fails, explain it simply.
>
> **1. Check tools.** Run `node --version` (need 18+) and `git --version`. If either is missing, stop and tell me to install it: Node from https://nodejs.org (LTS) and Git from https://git-scm.com . Continue after I install.
>
> **2. Get the code.**
> ```
> git clone https://github.com/jenniedov/jenai-studio.git
> cd jenai-studio
> ```
>
> **3. One-command setup** (installs dependencies and connects the studio's MCP to you):
> ```
> npm run setup
> ```
>
> **4. Run it.** Start the server as a background process so it stays running, then open it:
> ```
> npm start
> ```
> Open **http://localhost:4317** in my browser once it's up.
>
> **5. Confirm.** Make sure `http://localhost:4317` responds. When it's running, tell me "the app is ready" and point me to the popup asking for a provider key (Oxen or Kie). If I don't have one, explain how to get a free key.
>
> If any step errors, show it, explain it simply, and try to fix it. Don't skip a failed step.
