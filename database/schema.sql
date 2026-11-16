-- Desk Duel - database schema (MySQL 8+ / MariaDB 10.5+)
-- Run:  mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS desk_duel
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE desk_duel;

-- Question bank ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    category        VARCHAR(50)  NOT NULL DEFAULT 'General',
    question_text   VARCHAR(500) NOT NULL,
    option_a        VARCHAR(200) NOT NULL,
    option_b        VARCHAR(200) NOT NULL,
    option_c        VARCHAR(200) NOT NULL,
    option_d        VARCHAR(200) NOT NULL,
    correct_option  CHAR(1)      NOT NULL,           -- 'A', 'B', 'C' or 'D'
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_questions_category (category)
) ENGINE=InnoDB;

-- One row per game session ------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    code            CHAR(6)      NOT NULL UNIQUE,    -- what players type to join
    host_name       VARCHAR(50)  NOT NULL,
    host_token      CHAR(32)     NOT NULL,           -- secret that lets the host control the game
    category        VARCHAR(50)  NULL,               -- NULL = all categories
    num_questions   INT          NOT NULL,
    time_limit      INT          NOT NULL,           -- seconds per question
    status          ENUM('lobby','in_progress','finished') NOT NULL DEFAULT 'lobby',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at      DATETIME     NULL,
    ended_at        DATETIME     NULL
) ENGINE=InnoDB;

-- Which questions were picked for a game, and in what order ---------------
CREATE TABLE IF NOT EXISTS game_questions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    game_id         INT NOT NULL,
    question_id     INT NOT NULL,
    position        INT NOT NULL,                    -- 1, 2, 3 ...
    UNIQUE KEY uq_game_position (game_id, position),
    FOREIGN KEY (game_id)     REFERENCES games(id)     ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id)
) ENGINE=InnoDB;

-- Players in a game -------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    game_id         INT          NOT NULL,
    name            VARCHAR(30)  NOT NULL,
    token           CHAR(32)     NOT NULL,           -- lets a player reconnect after a refresh
    score           INT          NOT NULL DEFAULT 0,
    correct_count   INT          NOT NULL DEFAULT 0,
    final_rank      INT          NULL,
    joined_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_game_player_name (game_id, name),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Every answer submitted --------------------------------------------------
CREATE TABLE IF NOT EXISTS answers (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    game_id           INT        NOT NULL,
    game_question_id  INT        NOT NULL,
    player_id         INT        NOT NULL,
    chosen_option     CHAR(1)    NOT NULL,
    is_correct        TINYINT(1) NOT NULL,
    response_ms       INT        NOT NULL,           -- how long the player took
    points            INT        NOT NULL DEFAULT 0,
    answered_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_one_answer (game_question_id, player_id),
    FOREIGN KEY (game_id)          REFERENCES games(id)          ON DELETE CASCADE,
    FOREIGN KEY (game_question_id) REFERENCES game_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id)        REFERENCES players(id)        ON DELETE CASCADE
) ENGINE=InnoDB;
