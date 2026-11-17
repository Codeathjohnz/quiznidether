# Quiz ni Dether

Quiz/exam system with full-screen proctoring.
**Frontend:** React (Vite) · **Backend:** PHP JSON API · **Database:** XAMPP MySQL (`quiz_ni_dether`, created automatically).

## Run it (XAMPP)
1. Start **Apache** and **MySQL** in the XAMPP Control Panel.
2. Open http://localhost/xampp/Quiz%20ni%20Dether/ (redirects to `app/`).
3. The first visit asks you to create the admin account.

## Hosting online (Hostinger VPS + Dokploy)
See **[DEPLOY.md](DEPLOY.md)** — push to GitHub, create a MySQL database and an app (Dockerfile) in Dokploy,
set the environment variables, add your domain with HTTPS, deploy.

## Teacher accounts (email or Google / Gmail)
- Teachers sign up on the login page with **email + password** or **Continue with Google**.
- Each teacher only sees **their own** classes, quizzes and results.
- To turn on Google sign-in:
  1. Open https://console.cloud.google.com/apis/credentials (create a project if asked).
  2. *Create credentials → OAuth client ID → Web application* (set up the consent screen first if Google asks).
  3. Under **Authorized JavaScript origins** add `http://localhost` (and `http://localhost:5173` for `npm run dev`).
  4. Copy the Client ID into `GOOGLE_CLIENT_ID` in `includes/config.php`. No rebuild needed.
- Google only allows `localhost` or `https://` sites, so teachers use Google sign-in on the XAMPP computer.
  On other devices (`http://192.168…`) they log in with email + password. Students never need to log in.

## Guide, reviews and the Developer dashboard
- **First-time guide** — new teachers get a tour where Dethy points at each menu item. Replay it with **❓ Guide** (bottom of the sidebar).
- **Reviews** — after making their first quiz/exam, every teacher must leave a star rating + comment (suggestion optional).
  They can edit it under **Review & Suggest**. Students can rate the system on the screen after they finish.
- **Developer dashboard** (menu **Developer**) — visits per day, devices, all teacher accounts, and every review/suggestion
  (mark as read / done, delete). The developer is the first account created, or the emails in `DEVELOPER_EMAILS`.

## Importing a questionnaire (TQ)
On a quiz's **Questions** page click **📥 Import TQ**:
1. Download the template (also in `templates/quiz-template.txt`) or copy the ready-made **AI prompt**,
   paste it into Claude (e.g. "Introduction to Computing, 30 items") and copy Claude's answer.
2. Upload a `.txt` / `.docx` file or paste the text, then click **Check questions**.
3. Review the preview (problems are listed with line numbers) and click **Import**.

Format: `1. Question` · choices `A. …` · `ANSWER: B` / `ANSWER: True` / `ANSWER: Babbage | Charles Babbage` ·
optional `POINTS: 2`, `TYPE: Identification`, section headings like `TEST II. TRUE OR FALSE`,
or an `ANSWER KEY` list at the end instead of `ANSWER:` lines.

**Figures (pictures / diagrams).** A question can show a figure to the students (tap to enlarge):
- In the question form: **🖼 Add a picture** (PNG, JPG, GIF, WEBP, SVG — click, drop or Ctrl+V), or paste SVG code.
- In a TQ: a `FIGURE:` line under the question, then an SVG drawing from `<svg …>` to `</svg>`.
  Tick **🖼 Include figures** in the AI prompt and Claude draws graphs, shapes and diagrams this way.
- Pictures inside a Word (`.docx`) TQ are imported as that question's figure automatically.
Figures are stored in the database (table `figures`), so they survive redeploys. Big photos are shrunk in the browser (max ~900 KB).

## Develop the React app
```
cd frontend
npm install
npm run dev      # http://localhost:5173  (API calls are proxied to XAMPP Apache)
npm run build    # rebuilds into ../app  (what Apache serves)
```
After changing anything in `frontend/src`, run `npm run build` so the XAMPP version is updated.

## Folders
| Path | What |
|------|------|
| `frontend/src/pages` | React pages (admin + `TakeQuiz.jsx` for students) |
| `app/` | Built React app (generated — don't edit) |
| `api/` | PHP JSON API (`index.php?action=...`) |
| `includes/` | DB connection, schema, grading, settings (`config.php`) |

## Settings (`includes/config.php`)
- `DB_*` — MySQL credentials (XAMPP default: root, no password)
- `GOOGLE_CLIENT_ID` — enables "Continue with Google" (see above)
- `ALLOW_SIGNUP` — set to `false` to stop new teachers from signing up
- `ALLOWED_EMAIL_DOMAINS` — e.g. `'gmail.com,myschool.edu.ph'` to limit who can sign up
- `AUTO_PASSING_PERCENT` — passing % used by "Automatic" mode (default 75)
- `HEARTBEAT_TIMEOUT` — seconds without a signal before a student shows as "📴 No signal" in Results (default 45)
- `OFFLINE_GRACE_SECONDS` — lost internet: the quiz keeps running on the student's device and answers are sent
  when it reconnects. After the time ends the server waits this long for that device before closing the attempt
  as "device stopped responding" (default 900 = 15 min). In per-question mode the next question waits for the device.
