# Desk Duel

A live multiplayer quiz game for the office. The host runs it on a laptop or projector, and players join from their phones or computers with a 6-digit game code.

- 2 to 20 players per game
- Everyone gets the same question at the same time
- The faster you answer correctly, the more points you get
- Live leaderboard after every question, with a podium at the end
- Question Bank page to add, edit, delete or bulk-import questions (CSV)
- Every game, player and answer is saved in MySQL

**Stack:** HTML, CSS, JavaScript · FastAPI · MySQL · mysql-connector-python

---

## 1. Requirements

- Python 3.10 or newer
- MySQL 8 (MariaDB 10.5+ also works)
- All players on the same office network (Wi-Fi/LAN) as the computer running the server

## 2. Create the database

From the project folder:

```bash
mysql -u root -p < backend/database/schema.sql
mysql -u root -p desk_duel < backend/database/seed_questions.sql
```

(Or open both files in MySQL Workbench and run them in that order.)

The seed file adds 120 starter questions: 30 each in General Knowledge, Ghana, Office & Tech, and Python & MySQL Basics. If you already have the earlier question bank, run this one-time update instead of rerunning the seed file:

```bash
mysql -u root -p desk_duel < backend/database/add_questions_to_30.sql
```

## 3. Install and configure the backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac / Linux
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your MySQL password:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=desk_duel
```

For online hosting, you can provide the provider's MySQL connection URL as `DATABASE_URL` instead of the individual `DB_*` settings. Use the `mysql://username:password@host:3306/database_name` format and URL-encode special characters in the username or password. Connector/Python uses these parsed values to create its MySQL connection pool.

## 4. Run it

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0` lets phones on the office network reach the server.
- Live game state is stored in MySQL, so the game can recover across backend restarts and serverless instances.
- On Windows, if a firewall pop-up appears, allow Python on **private networks**.

## 5. Play

1. On the host computer, open **http://localhost:8000/frontend/host.html**. You can put it on the projector.
2. Choose a category, the number of questions and the seconds per question, then click **Create game**.
3. The lobby screen shows the join address, a big game code and a QR code. Players scan the QR code, or open the address and type the code and their name.
4. When at least 2 players have joined, click **Start game**.
5. After each question, the screen shows the right answer, how many people chose each option, the fastest correct answer, and the leaderboard. Click **Next question** to continue.
6. After the last question you get the podium and the final leaderboard.

Host controls: remove a player from the lobby (×), **Show answer now** (skips the timer), **End game** (goes straight to the final results), and sound on/off.

If a player's phone locks or they refresh, they reconnect automatically and keep their score. The host can refresh too.

## How scoring works

| Situation | Points |
|---|---|
| Correct, answered instantly | 1,000 |
| Correct, answered at the buzzer | 500 |
| Correct, somewhere in between | Scales between 1,000 and 500 depending on speed |
| First correct answer on the question | +100 bonus ⚡ |
| Wrong answer or no answer | 0 |

- Answer times are measured on the server, so everyone is timed by the same clock.
- Each player gets one answer per question and cannot change it.
- A question closes early once every connected player has answered.
- Ties on the leaderboard are broken by total time spent on correct answers (faster wins). Players with exactly the same score and time share a rank.

You can change these values at the top of `backend/config.py` (`MAX_POINTS`, `MIN_POINTS`, `FASTEST_BONUS`, `GET_READY_SECONDS`, `MIN_PLAYERS`, `MAX_PLAYERS`).

## Question Bank

Open **http://localhost:8000/frontend/questions.html** to:

- See all questions, filtered by category
- Add or edit a question
- Delete a question. Click twice to confirm. Deleted questions are hidden, not erased, so old game history stays intact.
- Import many questions at once from a CSV with 7 columns:
  `category,question,option_a,option_b,option_c,option_d,correct`. The `correct` column is A, B, C or D.
- See the history of recent games and their winners

To stop just anyone from editing questions, set `ADMIN_PIN=1234` (your own PIN) in `.env`.

Hosting a game requires the host PIN `2002` by default. You can change it by setting `HOST_PIN` in `backend/.env` and in your production hosting environment.

## Deploy online with Vercel

The frontend and backend are separate Git repositories, so deploy them as two Vercel projects:

1. Deploy the backend repository as a Python project. Vercel detects `main.py`; no frontend directory is required in this repository.
2. In the backend project's environment settings, add `DATABASE_URL` from your hosted MySQL provider, `HOST_PIN=2002`, `PUBLIC_URL` set to the frontend's public URL, and `FRONTEND_ORIGINS` set to that same frontend origin. Set `DB_POOL_SIZE=2` to keep connection use modest across serverless instances.
3. If the database already has the old schema, run `backend/database/migrate_serverless_runtime.sql` once against it. For a new database, run `backend/database/schema.sql` and `backend/database/seed_questions.sql` instead.
4. Deploy the `desk-duel` repository as a static Vercel project. Set `window.DESK_DUEL_API_BASE` in `frontend/js/api-config.js` to the backend project's origin, then redeploy the frontend.

The browser polls the API for game changes, and MySQL stores the current game state. This lets the host and players reach different serverless instances without relying on process-local game memory. Keep database credentials in Vercel's environment settings; do not put them in the frontend config.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phones can't open the page | Make sure they're on the same Wi-Fi as the host computer, and allow Python through the Windows firewall. Guest Wi-Fi networks often block device-to-device traffic. |
| Join address shows the wrong IP | Set `PUBLIC_URL=http://<your-ip>:8000` in `.env`. Find your IP with `ipconfig` (Windows) or `ifconfig`/`ip a` (Mac/Linux). |
| "Could not connect to MySQL" in the console | Check the values in `backend/.env` and that MySQL is running. |
| Online frontend cannot reach the API | Set `DESK_DUEL_API_BASE` in `frontend/js/api-config.js`, and set `FRONTEND_ORIGINS` in the backend environment to the exact frontend origin. |
| Database error after deployment | Check `DATABASE_URL`, make sure the database accepts connections from the deployed backend, and apply `migrate_serverless_runtime.sql` to an existing database. |

## Project structure

```
desk-duel/
├── index.html             Join page (players land here from the QR code)
├── backend/               Separate backend Git repository
│   ├── main.py            FastAPI app: REST API, serves the frontend when bundled
│   ├── live_db.py         MySQL-backed live game state and actions
│   ├── game.py            Earlier in-process game engine
│   ├── db.py              All MySQL queries (mysql-connector-python, connection pool)
│   ├── config.py          Settings and game rules
│   ├── requirements.txt
│   ├── .env.example
│   └── database/
│       ├── schema.sql      Tables: questions, games, game_questions, players, answers
│       ├── seed_questions.sql 120 starter questions (30 per category)
│       ├── add_questions_to_30.sql One-time question-bank update
│       └── migrate_serverless_runtime.sql One-time update for existing game tables
└── frontend/
    ├── host.html          Host / projector screen
    ├── play.html          Player screen
    ├── questions.html     Question Bank and game history
    ├── css/style.css
    └── js/                common.js, host.js, play.js, questions.js, vendor/qrcode.js
```

## API reference

REST:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/games` | Create a game → `{code, host_token}` |
| GET | `/api/games/{code}` | Game status |
| POST | `/api/games/{code}/join` | Join with `{name}` → `{player_id, token}` |
| GET | `/api/games/{code}/stream` | Poll the current game state using the host or player token |
| POST | `/api/games/{code}/action` | Send host controls or a player answer |
| GET | `/api/categories` | Categories and question counts |
| GET/POST | `/api/questions` | List / add questions |
| PUT/DELETE | `/api/questions/{id}` | Edit / delete a question |
| POST | `/api/questions/import` | CSV import |
| GET | `/api/history` | Recent games |
| GET | `/api/health` | Server and database check |

The QR code library (`frontend/js/vendor/qrcode.js`) is qrcode-generator by Kazuhiko Arase, MIT licence. It is bundled, so the game works without internet access.
