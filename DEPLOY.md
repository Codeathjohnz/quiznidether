# Deploying Quiz ni Dether to a Hostinger VPS with Dokploy

How it works: you push the code to GitHub → Dokploy pulls it, builds the `Dockerfile`
(React app + PHP/Apache) and runs it next to a MySQL database → students open `https://your-domain`.

You need: a Hostinger VPS, a domain (or subdomain) you control, and a free GitHub account.

---

## Part 1 — Put the code on GitHub (on this PC, once)

1. **Install Git for Windows**: https://git-scm.com/download/win (keep the default options).
2. **Create an empty GitHub repository**: https://github.com/new
   - Name: `quiz-ni-dether`, visibility **Private**, do **not** add a README/.gitignore.
3. Open **PowerShell** (or "Git Bash") and run:

   ```powershell
   cd "C:\xampp\htdocs\xampp\Quiz ni Dether"
   git init
   git config user.name  "Your Name"
   git config user.email "you@example.com"
   git add .
   git status            # check: no node_modules, no app/ folder, no .sql files
   git commit -m "Quiz ni Dether"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/quiz-ni-dether.git
   git push -u origin main
   ```
   The first push opens a browser window to sign in to GitHub.

Later, after changing the code: `git add .` → `git commit -m "what changed"` → `git push`.

---

## Part 2 — Prepare the VPS and domain

1. **Install Dokploy on the VPS**
   - Easiest: Hostinger hPanel → **VPS** → **OS & Panel** → **Operating System** → choose the
     **Dokploy** template (this reinstalls the VPS — only do it on a new/empty VPS).
   - Or on an existing Ubuntu VPS, connect with SSH and run:
     `curl -sSL https://dokploy.com/install.sh | sh`
2. Open **http://YOUR-VPS-IP:3000** and create your Dokploy admin account.
3. **Point your domain to the VPS** — hPanel → **Domains** → your domain → **DNS / Nameservers** → add:
   | Type | Name | Points to | TTL |
   |------|------|-----------|-----|
   | A | `quiz` | YOUR-VPS-IP | 300 |

   This gives `quiz.yourdomain.com` (use `@` instead of `quiz` for the main domain).
4. In Dokploy → **Settings → Git** → **GitHub** → create/install the GitHub App and give it access to
   the `quiz-ni-dether` repository.

---

## Part 3 — Create the database

1. Dokploy → **Projects** → **Create Project** → name it `Quiz ni Dether`.
2. Inside the project → **Create Service → Database → MySQL** (MariaDB also works):
   - Name: `quiz-db`
   - Database name: `quiz_ni_dether`
   - User: `quiz`
   - Password: a long random password (save it!)
   - Root password: another long random password
3. Click **Deploy** and wait until it is running.
4. On the database page, copy the **Internal Host** (under *Internal Credentials*). You need it next.

Do not open the database to the internet (leave *External Port* empty).

---

## Part 4 — Create the app

1. In the same project → **Create Service → Application** → name `quiz-app`.
2. **General / Provider**: GitHub → repository `quiz-ni-dether` → branch `main`.
3. **Build Type**: **Dockerfile** (Docker file: `Dockerfile`, build context: `.`) → **Save**.
4. **Environment** tab → paste (replace the values in CAPITALS) → **Save**:

   ```env
   DB_HOST=INTERNAL-HOST-FROM-PART-3
   DB_PORT=3306
   DB_NAME=quiz_ni_dether
   DB_USER=quiz
   DB_PASS=YOUR-DATABASE-PASSWORD
   APP_URL=https://quiz.yourdomain.com
   APP_TIMEZONE=Asia/Manila
   ALLOW_SIGNUP=true
   ALLOWED_EMAIL_DOMAINS=
   GOOGLE_CLIENT_ID=
   ```
5. **Domains** tab → **Add Domain**:
   - Host: `quiz.yourdomain.com` · Path: `/` · **Container Port: `80`**
   - **HTTPS: on** · Certificate: **Let's Encrypt**
6. Click **Deploy** and watch the **Logs** (the first build takes a few minutes).
7. Open **https://quiz.yourdomain.com** → you should see **"Create the first teacher account"**.
   The tables are created automatically on the first visit.
8. Turn on **Auto Deploy** (General tab) so every `git push` redeploys automatically.

After your teachers have accounts you can set `ALLOW_SIGNUP=false` and redeploy.

---

## Optional

**Google sign-in** — in Google Cloud → Credentials → your OAuth client → *Authorized JavaScript origins*
add `https://quiz.yourdomain.com`. Put the Client ID in `GOOGLE_CLIENT_ID` and redeploy.

**Database backups** — Dokploy → `quiz-db` → **Backups** (needs an S3-compatible bucket, e.g. Cloudflare R2
or Backblaze B2). Recommended before exams.

**Moving the data from XAMPP** — usually not needed (create the account again on the server). If you want to:
export from XAMPP with `C:\xampp\mysql\bin\mysqldump -u root quiz_ni_dether > quiz.sql`, then in Dokploy open
the `quiz-db` **Terminal** / server SSH and import it with
`docker exec -i <mysql-container> mysql -u quiz -p quiz_ni_dether < quiz.sql`. Keep `quiz.sql` out of Git.

---

## Troubleshooting

| What you see | Fix |
|---|---|
| "Database connection failed. Check the DB_* environment variables" | `DB_HOST` must be the **Internal Host** of the database; check user/password/name, then redeploy. |
| 404 / Bad Gateway on the domain | Domain container port must be **80**; wait for the deploy to finish; check the DNS A record. |
| Certificate not issued | DNS must point to the VPS first (can take a few minutes), then redeploy the domain. |
| Build fails at `npm ci` | Make sure `frontend/package-lock.json` was pushed to GitHub. |
| Student links show `http://` or the wrong address | Set `APP_URL=https://quiz.yourdomain.com` and redeploy. |

## Settings reference (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | XAMPP values | MySQL connection |
| `APP_URL` | (auto) | Public address used in student links |
| `APP_TIMEZONE` | `Asia/Manila` | Time zone for start/finish times |
| `GOOGLE_CLIENT_ID` | empty | Enables "Continue with Google" |
| `ALLOW_SIGNUP` | `true` | Let new teachers sign up |
| `DEVELOPER_EMAILS` | empty (= first account) | Who can open the Developer dashboard, e.g. `me@gmail.com` |
| `ALLOWED_EMAIL_DOMAINS` | empty | e.g. `gmail.com,myschool.edu.ph` |
| `AUTO_PASSING_PERCENT` | `75` | Passing % for "Automatic" mode |
| `HEARTBEAT_TIMEOUT` | `45` | Seconds of silence before a student shows as "📴 No signal" in Results |
| `FOCUS_GRACE_SECONDS` | `5` | A pop-up / ad / notification that takes the focus for up to this many seconds is only a warning |
| `FOCUS_GRACE_TIMES` | `3` | How many such warnings a student gets before losing focus terminates the quiz (0 = strict, no warnings) |
| `OFFLINE_GRACE_SECONDS` | `900` | After the time ends, how long to wait for an offline device to send its answers before closing the attempt as "no heartbeat" |
