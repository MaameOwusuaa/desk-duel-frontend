# Desk Duel

A live multiplayer quiz game for the office. The host runs it on a laptop or projector, and players join from their phones or computers with a 6-digit game code.

- 2 to 20 players per game
- Everyone gets the same question at the same time
- The faster you answer correctly, the more points you get
- Live leaderboard after every question, with a podium at the end
- Question Bank page to add, edit, delete or bulk-import questions (CSV)
- Every game, player and answer is saved in MySQL

**Stack:** HTML, CSS, JavaScript · FastAPI (with WebSockets) · MySQL · mysql-connector-python

---

## 1. Requirements

- Python 3.10 or newer
- MySQL 8 (MariaDB 10.5+ also works)
- All players on the same office network (Wi-Fi/LAN) as the computer running the server

## 2. Create the database

From the project folder:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p desk_duel < database/seed_questions.sql
```

(Or open both files in MySQL Workbench and run them in that order.)

The seed file adds 120 starter questions: 30 each in General Knowledge, Ghana, Office & Tech, and Python & MySQL Basics. If you already have the earlier question bank, run this one-time update instead of rerunning the seed file:

```bash
mysql -u root -p desk_duel < database/add_questions_to_30.sql
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
- Use **one** worker (the default). Live games are kept in the server's memory.
- On Windows, if a firewall pop-up appears, allow Python on **private networks**.

## 5. Play

1. On the host computer, open **http://localhost:8000/host.html**. You can put it on the projector.
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

Open **http://localhost:8000/questions.html** to:

- See all questions, filtered by category
- Add or edit a question
- Delete a question. Click twice to confirm. Deleted questions are hidden, not erased, so old game history stays intact.
- Import many questions at once from a CSV with 7 columns:
  `category,question,option_a,option_b,option_c,option_d,correct`. The `correct` column is A, B, C or D.
- See the history of recent games and their winners

To stop just anyone from editing questions, set `ADMIN_PIN=1234` (your own PIN) in `.env`.

Hosting a game requires the host PIN `2002` by default. You can change it by setting `HOST_PIN` in `backend/.env` and in your production hosting environment.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phones can't open the page | Make sure they're on the same Wi-Fi as the host computer, and allow Python through the Windows firewall. Guest Wi-Fi networks often block device-to-device traffic. |
| Join address shows the wrong IP | Set `PUBLIC_URL=http://<your-ip>:8000` in `.env`. Find your IP with `ipconfig` (Windows) or `ifconfig`/`ip a` (Mac/Linux). |
| "Could not connect to MySQL" in the console | Check the values in `backend/.env` and that MySQL is running. |
| Server restarted mid-game | Live games are in memory, so start a new game. All finished answers are already saved in MySQL. |

## Project structure

```
desk-duel/
├── backend/
│   ├── main.py            FastAPI app: REST API, WebSockets, serves the frontend
│   ├── game.py            Live game engine (lobby, timer, scoring, leaderboard)
│   ├── db.py              All MySQL queries (mysql-connector-python, connection pool)
│   ├── config.py          Settings and game rules
│   ├── requirements.txt
│   └── .env.example
├── database/
│   ├── schema.sql         Tables: questions, games, game_questions, players, answers
│   ├── seed_questions.sql 120 starter questions (30 per category)
│   └── add_questions_to_30.sql One-time update for an existing question bank
└── frontend/
    ├── index.html         Join page (players land here from the QR code)
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
| GET | `/api/categories` | Categories and question counts |
| GET/POST | `/api/questions` | List / add questions |
| PUT/DELETE | `/api/questions/{id}` | Edit / delete a question |
| POST | `/api/questions/import` | CSV import |
| GET | `/api/history` | Recent games |
| GET | `/api/health` | Server and database check |

WebSockets:

- `/ws/host/{code}?token=...`: the host sends `start`, `next`, `reveal_now`, `end` and `kick`.
- `/ws/player/{code}?player_id=...&token=...`: the player sends `answer` with `{option: "A"–"D"}`.
- The server pushes `lobby`, `get_ready`, `question`, `answer_count`, `answer_locked`, `reveal` and `finished`.

The QR code library (`frontend/js/vendor/qrcode.js`) is qrcode-generator by Kazuhiko Arase, MIT licence. It is bundled, so the game works without internet access.
