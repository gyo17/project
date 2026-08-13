/* ═══════════════════════════════════════════════════════
   game.js
   จะบรรลุหรือจะบรรลัย
   Local + Bot + Firebase Online
═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* =====================================================
     CONFIG
  ===================================================== */

  const BOARD_SIZE = 50;
  const PUZZLE_CELL_COUNT = 10;

  const MATH_TIME = {
    easy: 15000,
    medium: 20000,
    hard: 25000
  };

  const WALK_STEP_MS = 260;
  const BURST_MS = 1000;
  const PRC_SHOW_MS = 1600;
  const NEXT_ROUND_MS = 300;

  const LAVA_INTERVAL_MS = 12000;
  const LAVA_GRACE_MS = 30000;

  const BOT_THINK = {
    easy: {
      minFrac: 0.55,
      maxFrac: 0.95,
      correctChance: 0.65
    },

    medium: {
      minFrac: 0.40,
      maxFrac: 0.92,
      correctChance: 0.75
    },

    hard: {
      minFrac: 0.28,
      maxFrac: 0.88,
      correctChance: 0.85
    }
  };

  const PLAYER_COLORS = [
    "#FF5722",
    "#00E5FF",
    "#FFD600",
    "#8BC34A",
    "#E040FB"
  ];

  const PLAYER_EMOJIS = [
    "🧑",
    "🧒",
    "👩",
    "🧔",
    "👧"
  ];

  const PUZZLE_EVENTS = [
    {
      icon: "⭐",
      goodLabel: n => `บรรลุ! เดินหน้า ${n} ช่อง 🎉`,
      badLabel: n => `บรรลัย... ถอยหลัง ${n} ช่อง 💀`
    },

    {
      icon: "🌋",
      goodLabel: n => `รอดลาวา! วิ่งหน้า ${n} ช่อง 🏃`,
      badLabel: n => `โดนลาวา! ถอย ${n} ช่อง 🔥`
    },

    {
      icon: "⚡",
      goodLabel: n => `ทางลัด! +${n} ช่อง ⚡`,
      badLabel: n => `หลงทาง -${n} ช่อง 🕸️`
    },

    {
      icon: "🕸️",
      goodLabel: n => `แหกกับดัก! ไป ${n} ช่อง 💪`,
      badLabel: n => `ติดใย ถอย ${n} ช่อง 😱`
    }
  ];

  /* =====================================================
     GAME MODE
  ===================================================== */

  const gameMode =
    sessionStorage.getItem("game_mode") || "local";

  const difficulty =
    sessionStorage.getItem("game_difficulty") || "medium";

  const onlineRoom =
    sessionStorage.getItem("online_room") || "";

  const onlineIsHost =
    sessionStorage.getItem("online_isHost") === "1";

  let onlineMe = null;

  try {
    onlineMe = JSON.parse(
      sessionStorage.getItem("online_me") || "null"
    );
  } catch (e) {
    onlineMe = null;
  }

  const isOnline =
    gameMode === "online" &&
    onlineRoom &&
    onlineMe;

  const MY_ID =
    isOnline && onlineMe
      ? Number(onlineMe.id)
      : 0;

  /* =====================================================
     FIREBASE
  ===================================================== */

  let roomRef = null;
  let playersRef = null;
  let firebaseListening = false;

  function firebaseReady() {
    return (
      typeof firebase !== "undefined" &&
      typeof DB !== "undefined" &&
      !!DB
    );
  }

  if (isOnline && firebaseReady()) {
    roomRef = DB.ref(`rooms/${onlineRoom}`);
    playersRef = roomRef.child("players");
  }

  /* =====================================================
     STATE
  ===================================================== */

  let players = [];

  let roundNumber = 0;
  let gameActive = false;
  let currentRoundId = 0;

  let mathAnswer = null;
  let mathChoices = [];
  let humanAnswered = false;

  let botTimeouts = [];
  let mathTimerInterval = null;
  let pendingBots = [];

  let PUZZLE_CELLS = [];

  let lavaLevel = 0;
  let lavaInterval = null;
  let lavaCountdownInterval = null;
  let lavaStartAt = 0;

  let remoteGameStarted = false;

  /* =====================================================
     LOCAL PLAYERS / BOT
  ===================================================== */

  let rawPlayers = [];

  if (isOnline) {

    rawPlayers = [];

    rawPlayers.push({
      id: MY_ID,
      name: onlineMe.name,
      color: onlineMe.color,
      emoji: onlineMe.emoji
    });

  } else {

    try {
      rawPlayers =
        JSON.parse(
          sessionStorage.getItem("game_players") || "null"
        ) || [];
    } catch (e) {
      rawPlayers = [];
    }

    if (!rawPlayers.length) {
      rawPlayers =
        PLAYER_COLORS.map((color, i) => ({
          id: i,
          name: i === 0 ? "คุณ" : `บอท ${i}`,
          color,
          emoji: PLAYER_EMOJIS[i]
        }));
    }
  }

  /* =====================================================
     AUDIO
  ===================================================== */

  let audioCtx = null;

  function getAudio() {
    if (!audioCtx) {
      audioCtx =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();
    }

    return audioCtx;
  }

  function beep(freqs, type, dur, gap, vol) {

    try {

      const ctx = getAudio();

      freqs.forEach((f, i) => {

        const o = ctx.createOscillator();
        const g = ctx.createGain();

        o.connect(g);
        g.connect(ctx.destination);

        o.type = type;
        o.frequency.value = f;

        const t =
          ctx.currentTime + i * gap;

        g.gain.setValueAtTime(0, t);

        g.gain.linearRampToValueAtTime(
          vol,
          t + 0.04
        );

        g.gain.exponentialRampToValueAtTime(
          0.001,
          t + dur
        );

        o.start(t);
        o.stop(t + dur);
      });

    } catch (e) {}
  }

  function playSuccess() {
    beep(
      [523, 659, 784, 1046],
      "sine",
      0.24,
      0.12,
      0.22
    );
  }

  function playFail() {
    beep(
      [220, 180, 140],
      "sawtooth",
      0.28,
      0.15,
      0.18
    );
  }

  function playLavaRise() {

    try {

      const ctx = getAudio();

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.connect(g);
      g.connect(ctx.destination);

      o.type = "sawtooth";

      o.frequency.setValueAtTime(
        120,
        ctx.currentTime
      );

      o.frequency.linearRampToValueAtTime(
        60,
        ctx.currentTime + 0.6
      );

      g.gain.setValueAtTime(
        0,
        ctx.currentTime
      );

      g.gain.linearRampToValueAtTime(
        0.25,
        ctx.currentTime + 0.1
      );

      g.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + 0.6
      );

      o.start();
      o.stop(ctx.currentTime + 0.6);

    } catch (e) {}
  }

  /* =====================================================
     DOM
  ===================================================== */

  const $ = id =>
    document.getElementById(id);

  const boardEl = $("board");
  const scoreboardEl = $("scoreboard");

  const roundLabel = $("round-label");
  const diffLabel = $("difficulty-label");
  const puzzleCount = $("puzzle-cell-count");

  const lavaCountdownBadge =
    $("lava-countdown-badge");

  const lavaCountdownText =
    $("lava-countdown-text");

  const drawer =
    $("question-drawer");

  const qpNormal =
    $("qpanel-normal");

  const qpGold =
    $("qpanel-gold");

  const mathDiffEl =
    $("math-difficulty");

  const mathDeadlineEl =
    $("math-deadline");

  const mathExprEl =
    $("math-expression");

  const choicesGrid =
    $("choices-grid");

  const mathRaceList =
    $("math-race-list");

  const myPosNum =
    $("my-pos-num");

  const goldDeadlineEl =
    $("gold-deadline");

  const goldExprEl =
    $("gold-expression");

  const goldChoices =
    $("gold-choices-grid");

  const goldRaceList =
    $("gold-race-list");

  const goldEyebrow =
    $("gold-eyebrow");

  const goldFlavor =
    $("gold-flavor");

  const successBurst =
    $("success-burst");

  const burstIcon =
    $("burst-icon");

  const burstText =
    $("burst-text");

  const cutsceneWalk =
    $("cutscene-walk");

  const cutsceneTrack =
    $("cutscene-track");

  const cutsceneAvatar =
    $("cutscene-avatar");

  const cutsceneCaption =
    $("cutscene-caption");

  const prcOverlay =
    $("puzzle-result-overlay");

  const prcIcon =
    $("prc-icon");

  const prcTitle =
    $("prc-title");

  const prcSub =
    $("prc-sub");

  const modalConfirm =
    $("modal-confirm");

  const confirmTitle =
    $("confirm-title");

  const confirmMsg =
    $("confirm-msg");

  const confirmOk =
    $("confirm-ok");

  const confirmCancel =
    $("confirm-cancel");

  const modalWin =
    $("modal-win");

  const winName =
    $("win-name");

  const winSub =
    $("win-sub");

  const winRankList =
    $("win-rank-list");

  const lavaFlashEl =
    $("lava-flash");

  /* =====================================================
     GET MY PLAYER
  ===================================================== */

  function getMe() {

    return players.find(
      p => Number(p.id) === MY_ID
    );
  }

  function getPlayerById(id) {

    return players.find(
      p => Number(p.id) === Number(id)
    );
  }

  /* =====================================================
     CONFIRM
  ===================================================== */

  function showConfirm(title, msg, onOk) {

    if (!modalConfirm) {
      onOk();
      return;
    }

    confirmTitle.textContent = title;
    confirmMsg.textContent = msg;

    modalConfirm.classList.add("show");

    const cleanup = () => {

      confirmOk.removeEventListener(
        "click",
        ok
      );

      confirmCancel.removeEventListener(
        "click",
        cancel
      );

      modalConfirm.classList.remove(
        "show"
      );
    };

    const ok = () => {
      cleanup();
      onOk();
    };

    const cancel = () => {
      cleanup();
    };

    confirmOk.addEventListener(
      "click",
      ok
    );

    confirmCancel.addEventListener(
      "click",
      cancel
    );
  }

  /* =====================================================
     NAV
  ===================================================== */

  $("btn-back-home")?.addEventListener(
    "click",
    e => {

      e.stopPropagation();

      showConfirm(
        "🏠 กลับหน้าหลัก",
        "เกมจะยุติ ต้องการกลับจริงๆ ไหม?",
        () => {
          stopAll();

          if (isOnline) {
            leaveOnlineRoom();
          }

          location.href =
            "index.html";
        }
      );
    }
  );

  $("btn-stop-game")?.addEventListener(
    "click",
    e => {

      e.stopPropagation();

      if (!gameActive) return;

      showConfirm(
        "⏹ หยุดเกม",
        "ต้องการหยุดเกมไหม?",
        () => {

          stopAll();

          if (isOnline) {
            setRoomStatus("finished");
          }

          showWinScreen(null);
        }
      );
    }
  );

  $("btn-exit-q")?.addEventListener(
    "click",
    e => {

      e.stopPropagation();

      showConfirm(
        "🏠 ออกเกม",
        "ต้องการออกจากเกมไหม?",
        () => {

          stopAll();

          if (isOnline) {
            leaveOnlineRoom();
          }

          location.href =
            "index.html";
        }
      );
    }
  );

  $("btn-exit-gold")?.addEventListener(
    "click",
    e => {

      e.stopPropagation();

      showConfirm(
        "🏠 ออกเกม",
        "ต้องการออกจากเกมไหม?",
        () => {

          stopAll();

          if (isOnline) {
            leaveOnlineRoom();
          }

          location.href =
            "index.html";
        }
      );
    }
  );

  $("btn-play-again")?.addEventListener(
    "click",
    () => {

      if (isOnline) {
        location.href =
          "index.html";
      } else {
        location.reload();
      }
    }
  );

  $("btn-home-from-win")?.addEventListener(
    "click",
    () => {

      if (isOnline) {
        leaveOnlineRoom();
      }

      location.href =
        "index.html";
    }
  );

  /* =====================================================
     FIREBASE ONLINE
  ===================================================== */

  function setRoomStatus(status) {

    if (!isOnline || !roomRef) return;

    roomRef.update({
      status
    }).catch(err => {
      console.error(
        "Firebase status error:",
        err
      );
    });
  }

  async function leaveOnlineRoom() {

    if (!isOnline || !playersRef) return;

    try {

      await playersRef
        .child(String(MY_ID))
        .remove();

    } catch (e) {

      console.error(
        "Leave room error:",
        e
      );
    }
  }

  async function syncMyPlayer() {

    if (!isOnline || !playersRef) return;

    const me = getMe();

    if (!me) return;

    try {

      await playersRef
        .child(String(MY_ID))
        .update({
          pos: me.pos,
          finished: !!me.finished,
          eliminated: !!me.eliminated,
          finishRank:
            me.finishRank ?? null,
          connected: true
        });

    } catch (e) {

      console.error(
        "Sync player error:",
        e
      );
    }
  }

  function listenFirebase() {

    if (!isOnline || !roomRef || firebaseListening) {
      return;
    }

    firebaseListening = true;

    /*
     * ฟังข้อมูลผู้เล่น
     */

    playersRef.on(
      "value",
      snapshot => {

        const data =
          snapshot.val() || {};

        const remotePlayers =
          Object.keys(data)
            .map(key => {

              const p =
                data[key];

              return {
                id: Number(
                  p.id ?? key
                ),

                name:
                  p.name ||
                  `ผู้เล่น ${Number(key) + 1}`,

                color:
                  p.color ||
                  PLAYER_COLORS[
                    Number(key) %
                    PLAYER_COLORS.length
                  ],

                emoji:
                  p.emoji ||
                  PLAYER_EMOJIS[
                    Number(key) %
                    PLAYER_EMOJIS.length
                  ],

                pos:
                  Number(p.pos || 0),

                finished:
                  !!p.finished,

                eliminated:
                  !!p.eliminated,

                finishRank:
                  p.finishRank ?? null,

                connected:
                  p.connected !== false
              };

            })
            .sort(
              (a, b) =>
                Number(a.id) -
                Number(b.id)
            );

        /*
         * Online ต้องใช้ข้อมูลจาก Firebase
         */

        if (isOnline) {

          const oldPlayers =
            players;

          players =
            remotePlayers;

          /*
           * ถ้าเราเพิ่งเข้าห้อง
           * ยังไม่มีเกมเริ่ม ให้แสดงกระดาน
           */

          if (!gameActive) {

            renderTokens();
            renderScoreboard();
          }

          /*
           * ถ้าตำแหน่งเปลี่ยน
           * ให้แสดงผลบนกระดานทันที
           */

          if (oldPlayers.length) {

            remotePlayers.forEach(p => {

              const old =
                oldPlayers.find(
                  x =>
                    Number(x.id) ===
                    Number(p.id)
                );

              if (
                old &&
                old.pos !== p.pos
              ) {

                renderTokens(
                  p.id
                );

                renderScoreboard(
                  p.id
                );
              }

            });
          }

          /*
           * ถ้าผู้เล่นคนอื่นเข้า/ออก
           */

          renderTokens();
          renderScoreboard();

          checkRemoteWinner();
        }
      }
    );

    /*
     * ฟังสถานะห้อง
     */

    roomRef.on(
      "value",
      snapshot => {

        const room =
          snapshot.val();

        if (!room) return;

        /*
         * difficulty จาก Firebase
         */

        if (
          isOnline &&
          room.difficulty &&
          !gameActive
        ) {
          diffLabel.textContent =
            diffNames(room.difficulty);
        }

        /*
         * รับ lava level
         */

        if (
          isOnline &&
          typeof room.lavaLevel ===
            "number"
        ) {

          lavaLevel =
            room.lavaLevel;

          renderLava();
        }

        /*
         * Host เริ่มเกม
         */

        if (
          room.status === "playing" &&
          !remoteGameStarted
        ) {

          remoteGameStarted = true;

          if (!gameActive) {

            gameActive = true;

            startOnlineRounds();
          }
        }

        /*
         * เกมจบ
         */

        if (
          room.status === "finished"
        ) {

          if (
            gameActive
          ) {

            gameActive = false;

            closeDrawer();

            showWinScreen(
              findWinner()
            );
          }
        }
      }
    );
  }

  function checkRemoteWinner() {

    if (!isOnline) return;

    const winner =
      players.find(
        p =>
          p.finished &&
          Number(p.finishRank) === 1
      );

    if (winner) {

      if (gameActive) {

        gameActive = false;

        clearInterval(
          mathTimerInterval
        );

        closeDrawer();

        showWinScreen(
          winner
        );
      }
    }
  }

  function findWinner() {

    return (
      players.find(
        p =>
          p.finished &&
          Number(p.finishRank) === 1
      ) ||
      [...players]
        .sort(
          (a, b) =>
            Number(b.pos) -
            Number(a.pos)
        )[0] ||
      null
    );
  }

  /* =====================================================
     LOCAL / ONLINE STOP
  ===================================================== */

  function stopAll() {

    gameActive = false;

    currentRoundId++;

    clearInterval(
      mathTimerInterval
    );

    clearInterval(
      lavaInterval
    );

    clearInterval(
      lavaCountdownInterval
    );

    botTimeouts.forEach(
      t => clearTimeout(t)
    );

    botTimeouts = [];

    closeDrawer();

    successBurst?.classList.remove(
      "show"
    );

    cutsceneWalk?.classList.remove(
      "show"
    );

    prcOverlay?.classList.remove(
      "show"
    );
  }

  /* =====================================================
     ATMOSPHERE
  ===================================================== */

  function buildAtmosphere() {

    const stal =
      $("stalactites");

    if (
      stal &&
      !stal.dataset.built
    ) {

      stal.dataset.built = "1";

      for (
        let i = 0;
        i < 24;
        i++
      ) {

        const s =
          document.createElement(
            "div"
          );

        s.className =
          "stalactite";

        const w =
          12 +
          Math.random() * 22;

        const h =
          26 +
          Math.random() * 100;

        s.style.cssText =
          `border-left-width:${w / 2}px;` +
          `border-right-width:${w / 2}px;` +
          `border-top-width:${h}px;` +
          `border-top-color:hsl(` +
          `${260 + Math.random() * 20},` +
          `${30 + Math.random() * 15}%,` +
          `${10 + Math.random() * 10}%);` +
          `animation-delay:${Math.random() * 3}s;` +
          `animation-duration:${2.5 + Math.random() * 2}s;` +
          `flex:0 0 auto;`;

        stal.appendChild(s);
      }
    }

    const em =
      $("embers");

    if (
      em &&
      !em.dataset.built
    ) {

      em.dataset.built = "1";

      for (
        let i = 0;
        i < 20;
        i++
      ) {

        const e =
          document.createElement(
            "div"
          );

        e.className =
          "ember";

        e.style.cssText =
          `left:${Math.random() * 100}%;` +
          `--drift:${(Math.random() - 0.5) * 60}px;` +
          `animation-duration:${4 + Math.random() * 5}s;` +
          `animation-delay:${Math.random() * 6}s;`;

        em.appendChild(e);
      }
    }
  }

  /* =====================================================
     BOARD
  ===================================================== */

  function buildBoard() {

    if (!boardEl) return;

    boardEl.innerHTML = "";

    const rows = [];

    for (
      let r = 0;
      r < 5;
      r++
    ) {

      let v =
        Array.from(
          {
            length: 10
          },
          (_, c) =>
            r * 10 + c + 1
        );

      if (r % 2 === 1) {
        v.reverse();
      }

      rows.push(v);
    }

    for (
      let r = 4;
      r >= 0;
      r--
    ) {

      rows[r].forEach(
        val => {

          const cell =
            document.createElement(
              "div"
            );

          cell.className =
            "cell";

          cell.dataset.cell =
            val;

          const ns =
            document.createElement(
              "span"
            );

          ns.className =
            "cell-num";

          ns.textContent =
            val;

          cell.appendChild(ns);

          if (val === 1) {
            cell.classList.add(
              "is-start"
            );
          }

          if (
            val === BOARD_SIZE
          ) {
            cell.classList.add(
              "is-finish"
            );
          }

          if (
            PUZZLE_CELLS.includes(val)
          ) {
            cell.classList.add(
              "is-puzzle-gold"
            );
          }

          if (
            val <= lavaLevel &&
            val > 0
          ) {
            cell.classList.add(
              "is-lava-consumed"
            );
          }

          const tw =
            document.createElement(
              "div"
            );

          tw.className =
            "cell-tokens";

          tw.id =
            `tokens-${val}`;

          cell.appendChild(tw);

          boardEl.appendChild(cell);
        }
      );
    }
  }

  function renderLava() {

    document
      .querySelectorAll(
        ".cell"
      )
      .forEach(
        el => {

          const val =
            Number(
              el.dataset.cell
            );

          el.classList.toggle(
            "is-lava-consumed",
            val > 0 &&
            val <= lavaLevel
          );
        }
      );
  }

  function renderTokens(
    highlightId = null
  ) {

    document
      .querySelectorAll(
        ".cell-tokens"
      )
      .forEach(
        el => {
          el.innerHTML = "";
        }
      );

    players.forEach(
      p => {

        if (
          p.pos < 1 ||
          p.eliminated
        ) {
          return;
        }

        const wrap =
          $(`tokens-${p.pos}`);

        if (!wrap) return;

        const dot =
          document.createElement(
            "div"
          );

        dot.className =
          "token-dot" +
          (
            Number(p.id) ===
            Number(highlightId)
              ? " just-moved"
              : ""
          );

        dot.style.background =
          p.color;

        dot.textContent =
          p.emoji;

        dot.title =
          p.name;

        wrap.appendChild(dot);
      }
    );
  }

  function zoomToPlayer() {

    const me =
      getMe();

    if (
      !me ||
      me.pos < 1
    ) {
      return;
    }

    const cellEl =
      document.querySelector(
        `.cell[data-cell="${me.pos}"]`
      );

    if (cellEl) {

      cellEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center"
      });
    }
  }

  /* =====================================================
     SCOREBOARD
  ===================================================== */

  function renderScoreboard(
    flashId = null
  ) {

    if (!scoreboardEl) return;

    scoreboardEl.innerHTML = "";

    players.forEach(
      p => {

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "score-row" +
          (
            Number(p.id) ===
            Number(flashId)
              ? " just-moved"
              : ""
          );

        if (p.eliminated) {
          row.style.opacity = ".45";
        }

        const tok =
          document.createElement(
            "div"
          );

        tok.className =
          "score-token";

        tok.style.background =
          p.color + "33";

        tok.style.border =
          `2px solid ${p.color}`;

        tok.textContent =
          p.eliminated
            ? "💀"
            : p.emoji;

        const info =
          document.createElement(
            "div"
          );

        info.className =
          "score-info";

        const nm =
          document.createElement(
            "div"
          );

        nm.className =
          "score-name";

        nm.textContent =
          p.name;

        const ps =
          document.createElement(
            "div"
          );

        ps.className =
          "score-pos";

        ps.textContent =
          p.eliminated
            ? "ถูกลาวา"
            : p.pos === 0
              ? "จุดเริ่มต้น"
              : `ช่อง ${p.pos}`;

        info.appendChild(nm);
        info.appendChild(ps);

        const st =
          document.createElement(
            "div"
          );

        st.className =
          "score-status";

        st.textContent =
          p.finished
            ? "🏁"
            : "";

        row.appendChild(tok);
        row.appendChild(info);
        row.appendChild(st);

        scoreboardEl.appendChild(row);
      }
    );
  }

  /* =====================================================
     RACE STRIP
  ===================================================== */

  function buildRaceStrip(
    container
  ) {

    if (!container) return;

    container.innerHTML = "";

    players.forEach(
      (p, i) => {

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "race-row";

        row.id =
          `race-${container.id}-${p.id}`;

        const dot =
          document.createElement(
            "span"
          );

        dot.className =
          "race-dot";

        dot.style.background =
          p.color;

        const nm =
          document.createElement(
            "span"
          );

        nm.className =
          "race-name";

        nm.appendChild(dot);

        nm.appendChild(
          document.createTextNode(
            " " +
            p.name +
            (
              Number(p.id) ===
              MY_ID
                ? " (คุณ)"
                : ""
            )
          )
        );

        const st =
          document.createElement(
            "span"
          );

        st.className =
          "race-status";

        st.id =
          `rst-${container.id}-${p.id}`;

        st.textContent =
          p.finished
            ? "🏁"
            : p.eliminated
              ? "💀"
              : "รอ...";

        row.appendChild(nm);
        row.appendChild(st);

        container.appendChild(row);
      }
    );
  }

  function updateRaceRow(
    container,
    playerId,
    correct
  ) {

    if (!container) return;

    const row =
      document.getElementById(
        `race-${container.id}-${playerId}`
      );

    const st =
      document.getElementById(
        `rst-${container.id}-${playerId}`
      );

    if (!row || !st) return;

    row.className =
      "race-row" +
      (
        correct
          ? " r-correct"
          : " r-wrong"
      );

    st.textContent =
      correct
        ? "✓ เดิน!"
        : "✗ ผิด";
  }

  /* =====================================================
     CHOICES
  ===================================================== */

  function buildChoices(
    grid,
    choices,
    onPick
  ) {

    if (!grid) return;

    grid.innerHTML = "";

    choices.forEach(
      val => {

        const btn =
          document.createElement(
            "button"
          );

        btn.className =
          "choice-btn";

        btn.textContent =
          val;

        btn.dataset.val =
          val;

        btn.addEventListener(
          "click",
          () =>
            onPick(
              val,
              choices
            )
        );

        grid.appendChild(btn);
      }
    );
  }

  function lockChoices(
    grid,
    correct,
    chosen
  ) {

    if (!grid) return;

    grid
      .querySelectorAll(
        ".choice-btn"
      )
      .forEach(
        b => {

          b.disabled = true;

          if (
            Number(b.dataset.val) ===
            Number(correct)
          ) {
            b.classList.add(
              "correct"
            );
          }

          if (
            Number(b.dataset.val) ===
              Number(chosen) &&
            Number(chosen) !==
              Number(correct)
          ) {
            b.classList.add(
              "wrong"
            );
          }
        }
      );
  }

  /* =====================================================
     TIMER
  ===================================================== */

  function startTimer(
    el,
    limitMs,
    onExpire
  ) {

    clearInterval(
      mathTimerInterval
    );

    let rem =
      limitMs;

    const myId =
      currentRoundId;

    if (el) {
      el.textContent =
        (rem / 1000).toFixed(0) +
        "s";
    }

    mathTimerInterval =
      setInterval(
        () => {

          if (
            currentRoundId !==
            myId
          ) {

            clearInterval(
              mathTimerInterval
            );

            return;
          }

          rem -= 100;

          const d =
            Math.max(
              0,
              rem / 1000
            );

          if (el) {

            el.textContent =
              d >= 10
                ? d.toFixed(0) + "s"
                : d.toFixed(1) + "s";
          }

          if (rem <= 0) {

            clearInterval(
              mathTimerInterval
            );

            if (gameActive) {
              onExpire();
            }
          }
        },
        100
      );
  }

  /* =====================================================
     DRAWER
  ===================================================== */

  function openDrawer(
    gold = false
  ) {

    if (!drawer) return;

    qpNormal?.classList.toggle(
      "active",
      !gold
    );

    qpGold?.classList.toggle(
      "active",
      gold
    );

    drawer.classList.add(
      "open"
    );
  }

  function closeDrawer() {

    drawer?.classList.remove(
      "open"
    );
  }

  /* =====================================================
     LAVA
  ===================================================== */

  function beginLavaCountdown() {

    lavaStartAt =
      Date.now() +
      LAVA_GRACE_MS;

    updateLavaCountdown();

    clearInterval(
      lavaCountdownInterval
    );

    lavaCountdownInterval =
      setInterval(
        updateLavaCountdown,
        500
      );
  }

  function updateLavaCountdown() {

    if (!gameActive) return;

    const remain =
      lavaStartAt -
      Date.now();

    if (remain <= 0) {

      clearInterval(
        lavaCountdownInterval
      );

      lavaCountdownInterval =
        null;

      lavaCountdownBadge
        ?.classList.add(
          "lava-active"
        );

      if (lavaCountdownText) {
        lavaCountdownText.textContent =
          "ไหลแล้ว! 🌋";
      }

      startLavaFlow();

      return;
    }

    const totalSec =
      Math.ceil(
        remain / 1000
      );

    const mm =
      String(
        Math.floor(
          totalSec / 60
        )
      ).padStart(2, "0");

    const ss =
      String(
        totalSec % 60
      ).padStart(2, "0");

    if (lavaCountdownText) {
      lavaCountdownText.textContent =
        `${mm}:${ss}`;
    }

    lavaCountdownBadge
      ?.classList.toggle(
        "lava-warn",
        totalSec <= 60
      );
  }

  function startLavaFlow() {

    if (isOnline && !onlineIsHost) {
      return;
    }

    clearInterval(
      lavaInterval
    );

    lavaInterval =
      setInterval(
        () => {

          if (!gameActive) return;

          lavaLevel =
            Math.min(
              BOARD_SIZE,
              lavaLevel + 1
            );

          if (isOnline) {

            roomRef?.update({
              lavaLevel
            });

          }

          consumeCell(
            lavaLevel
          );

          playLavaRise();
          flashLava();

          players.forEach(
            p => {

              if (
                !p.eliminated &&
                !p.finished &&
                p.pos > 0 &&
                p.pos <= lavaLevel
              ) {

                eliminatePlayer(
                  p
                );
              }
            }
          );

          if (
            lavaLevel >=
            BOARD_SIZE
          ) {

            stopAll();

            if (isOnline) {
              setRoomStatus(
                "finished"
              );
            }

            showWinScreen(
              null
            );
          }
        },
        LAVA_INTERVAL_MS
      );
  }

  function consumeCell(
    val
  ) {

    const el =
      document.querySelector(
        `.cell[data-cell="${val}"]`
      );

    if (!el) return;

    el.classList.add(
      "lava-eating"
    );

    setTimeout(
      () => {

        el.classList.remove(
          "lava-eating"
        );

        el.classList.add(
          "is-lava-consumed"
        );

      },
      500
    );
  }

  function flashLava() {

    if (!lavaFlashEl) return;

    lavaFlashEl.classList.remove(
      "flash"
    );

    void lavaFlashEl.offsetWidth;

    lavaFlashEl.classList.add(
      "flash"
    );
  }

  function eliminatePlayer(
    p
  ) {

    if (p.eliminated) return;

    p.eliminated = true;

    renderTokens();
    renderScoreboard();

    if (isOnline) {

      playersRef
        ?.child(String(p.id))
        .update({
          eliminated: true
        });
    }

    if (
      Number(p.id) ===
      MY_ID
    ) {

      showBurst(
        "🔥",
        `${p.name} โดนลาวา!`,
        () => {

          stopAll();

          if (isOnline) {
            setRoomStatus(
              "finished"
            );
          }

          showWinScreen(
            null
          );
        }
      );
    }
  }

  /* =====================================================
     INIT
  ===================================================== */

  function initGame() {

    roundNumber = 0;
    gameActive = true;
    currentRoundId = 0;
    lavaLevel = 0;

    const diff =
      difficulty;

    diffLabel.textContent =
      diffNames(diff);

    /*
     * Local = สร้างบอท
     */

    if (!isOnline) {

      players =
        rawPlayers.map(
          p => ({
            ...p,
            pos: 0,
            finished: false,
            eliminated: false,
            finishRank: null
          })
        );

    } else {

      /*
       * Online:
       * เริ่มด้วยผู้เล่นของเรา
       * แล้ว Firebase จะเติมคนอื่น
       */

      players = [
        {
          id: MY_ID,
          name: onlineMe.name,
          color: onlineMe.color,
          emoji: onlineMe.emoji,
          pos: 0,
          finished: false,
          eliminated: false,
          finishRank: null,
          connected: true
        }
      ];

      listenFirebase();
    }

    /*
     * สุ่มช่องทอง
     */

    const pool =
      Array.from(
        {
          length: 48
        },
        (_, i) =>
          i + 2
      );

    for (
      let i = pool.length - 1;
      i > 0;
      i--
    ) {

      const j =
        Math.floor(
          Math.random() *
          (i + 1)
        );

      [
        pool[i],
        pool[j]
      ] =
      [
        pool[j],
        pool[i]
      ];
    }

    PUZZLE_CELLS =
      pool.slice(
        0,
        PUZZLE_CELL_COUNT
      );

    if (puzzleCount) {
      puzzleCount.textContent =
        PUZZLE_CELLS.length;
    }

    buildAtmosphere();
    buildBoard();
    renderTokens();
    renderScoreboard();

    /*
     * Local เริ่มทันที
     */

    if (!isOnline) {

      beginLavaCountdown();

      setTimeout(
        startRound,
        700
      );

    } else {

      /*
       * Online ให้ Host เป็นคนเริ่ม
       */

      if (onlineIsHost) {

        roomRef?.update({
          status: "playing",
          roundNumber: 0,
          lavaLevel: 0
        });

        beginLavaCountdown();

        setTimeout(
          startOnlineRounds,
          700
        );
      }
    }
  }

  function diffNames(
    diff
  ) {

    return {
      easy: "🌿 ง่าย",
      medium: "🔥 ปานกลาง",
      hard: "💀 ยาก"
    }[diff] ||
      "🔥 ปานกลาง";
  }

  /* =====================================================
     ROUND
  ===================================================== */

  function startRound() {

    if (!gameActive) return;

    flushPendingBots();

    const activePlayers =
      players.filter(
        p =>
          !p.finished &&
          !p.eliminated
      );

    if (
      activePlayers.length === 0
    ) {

      stopAll();
      showWinScreen(null);

      return;
    }

    roundNumber++;
    currentRoundId++;

    const myRoundId =
      currentRoundId;

    if (roundLabel) {
      roundLabel.textContent =
        `รอบที่ ${roundNumber}`;
    }

    const me =
      getMe();

    if (!me) return;

    if (
      me.finished ||
      me.eliminated
    ) {

      scheduleBotsOnly(
        myRoundId
      );

      return;
    }

    const timeLimit =
      MATH_TIME[difficulty] ||
      20000;

    const q =
      generateQuestion(
        difficulty
      );

    mathAnswer =
      q.answer;

    mathChoices =
      makeChoices(
        q.answer
      );

    humanAnswered =
      false;

    const onGold =
      PUZZLE_CELLS.includes(
        me.pos
      );

    if (onGold) {

      openGoldQuestion(
        me,
        q,
        timeLimit,
        myRoundId
      );

    } else {

      openNormalQuestion(
        me,
        q,
        timeLimit,
        myRoundId
      );
    }

    runBots(
      myRoundId,
      timeLimit,
      onGold
    );
  }

  /* =====================================================
     NORMAL QUESTION
  ===================================================== */

  function openNormalQuestion(
    me,
    q,
    timeLimit,
    myRoundId
  ) {

    if (myPosNum) {
      myPosNum.textContent =
        me.pos;
    }

    if (mathDiffEl) {

      mathDiffEl.textContent =
        diffLabel2(
          q.diff
        );

      mathDiffEl.dataset.level =
        q.diff;
    }

    if (mathExprEl) {
      mathExprEl.textContent =
        q.expr;
    }

    buildRaceStrip(
      mathRaceList
    );

    buildChoices(
      choicesGrid,
      mathChoices,
      chosen => {

        if (
          humanAnswered ||
          currentRoundId !==
            myRoundId
        ) {
          return;
        }

        humanAnswered = true;

        clearInterval(
          mathTimerInterval
        );

        const correct =
          Number(chosen) ===
          Number(mathAnswer);

        lockChoices(
          choicesGrid,
          mathAnswer,
          chosen
        );

        updateRaceRow(
          mathRaceList,
          MY_ID,
          correct
        );

        if (isOnline) {

          writeAnswerResult(
            correct
          );
        }

        setTimeout(
          () => {

            closeDrawer();

            if (correct) {

              playSuccess();

              setTimeout(
                () => {

                  showBurst(
                    true,
                    null,
                    () => {

                      const from =
                        me.pos;

                      const to =
                        Math.min(
                          BOARD_SIZE,
                          me.pos + 1
                        );

                      showWalkCutscene(
                        me,
                        from,
                        to,
                        () => {

                          applyMove(
                            MY_ID,
                            1
                          );

                          scheduleNextRound();
                        }
                      );
                    }
                  );

                },
                260
              );

            } else {

              playFail();

              setTimeout(
                () => {

                  showBurst(
                    false,
                    null,
                    () => {

                      scheduleNextRound();

                    }
                  );

                },
                260
              );
            }

          },
          380
        );
      }
    );

    openDrawer(false);

    startTimer(
      mathDeadlineEl,
      timeLimit,
      () => {

        if (
          humanAnswered ||
          currentRoundId !==
            myRoundId
        ) {
          return;
        }

        humanAnswered = true;

        closeDrawer();

        if (isOnline) {
          writeAnswerResult(false);
        }

        setTimeout(
          scheduleNextRound,
          350
        );
      }
    );
  }

  /* =====================================================
     GOLD QUESTION
  ===================================================== */

  function openGoldQuestion(
    me,
    q,
    timeLimit,
    myRoundId
  ) {

    const ev =
      PUZZLE_EVENTS[
        Math.floor(
          Math.random() *
          PUZZLE_EVENTS.length
        )
      ];

    if (goldEyebrow) {

      goldEyebrow.textContent =
        `${ev.icon} จะบรรลุหรือจะบรรลัย!`;
    }

    if (goldFlavor) {

      goldFlavor.textContent =
        "ตอบถูก = เดินหน้า | ตอบผิด = ถอยหลัง (สุ่มจำนวนช่อง)";
    }

    if (goldExprEl) {
      goldExprEl.textContent =
        q.expr;
    }

    buildRaceStrip(
      goldRaceList
    );

    buildChoices(
      goldChoices,
      mathChoices,
      chosen => {

        if (
          humanAnswered ||
          currentRoundId !==
            myRoundId
        ) {
          return;
        }

        humanAnswered = true;

        clearInterval(
          mathTimerInterval
        );

        const correct =
          Number(chosen) ===
          Number(mathAnswer);

        lockChoices(
          goldChoices,
          mathAnswer,
          chosen
        );

        updateRaceRow(
          goldRaceList,
          MY_ID,
          correct
        );

        if (isOnline) {
          writeAnswerResult(
            correct
          );
        }

        setTimeout(
          () => {

            closeDrawer();

            PUZZLE_CELLS =
              PUZZLE_CELLS.filter(
                c =>
                  c !== me.pos
              );

            const cellEl =
              document.querySelector(
                `.cell[data-cell="${me.pos}"]`
              );

            if (cellEl) {

              cellEl.classList.remove(
                "is-puzzle-gold"
              );
            }

            if (puzzleCount) {

              puzzleCount.textContent =
                PUZZLE_CELLS.length;
            }

            setTimeout(
              () => {

                if (correct) {
                  playSuccess();
                } else {
                  playFail();
                }

                const steps =
                  randInt(1, 3);

                showPuzzleResult(
                  correct,
                  ev,
                  steps,
                  () => {

                    const delta =
                      correct
                        ? steps
                        : -steps;

                    const from =
                      me.pos;

                    const to =
                      Math.min(
                        BOARD_SIZE,
                        Math.max(
                          0,
                          me.pos +
                            delta
                        )
                      );

                    if (
                      to !==
                      from
                    ) {

                      showWalkCutscene(
                        me,
                        from,
                        to,
                        () => {

                          applyMove(
                            MY_ID,
                            delta
                          );

                          scheduleNextRound();
                        }
                      );

                    } else {

                      scheduleNextRound();

                    }
                  }
                );

              },
              350
            );

          },
          420
        );
      }
    );

    openDrawer(true);

    startTimer(
      goldDeadlineEl,
      timeLimit,
      () => {

        if (
          humanAnswered ||
          currentRoundId !==
            myRoundId
        ) {
          return;
        }

        humanAnswered = true;

        closeDrawer();

        if (isOnline) {
          writeAnswerResult(false);
        }

        setTimeout(
          scheduleNextRound,
          350
        );
      }
    );
  }

  /* =====================================================
     ONLINE ANSWER
  ===================================================== */

  function writeAnswerResult(
    correct
  ) {

    if (!isOnline || !roomRef) {
      return;
    }

    roomRef
      .child(
        `answers/${MY_ID}`
      )
      .set({
        correct: !!correct,
        timestamp:
          firebase.database
            .ServerValue
            .TIMESTAMP
      })
      .catch(
        err =>
          console.error(
            "Answer sync error:",
            err
          )
      );
  }

  /* =====================================================
     ONLINE ROUND
  ===================================================== */

  function startOnlineRounds() {

    if (!gameActive) return;

    if (
      !onlineIsHost
    ) {

      /*
       * คน Join ไม่สร้างรอบเอง
       * แต่รอ Host
       */

      listenOnlineRound();

      return;
    }

    startRound();
  }

  let onlineRoundListening =
    false;

  function listenOnlineRound() {

    if (
      !isOnline ||
      !roomRef ||
      onlineRoundListening
    ) {
      return;
    }

    onlineRoundListening = true;

    roomRef.on(
      "value",
      snapshot => {

        const room =
          snapshot.val();

        if (!room) return;

        const rn =
          Number(
            room.roundNumber || 0
          );

        /*
         * ถ้า Host เปลี่ยนรอบ
         */

        if (
          rn > roundNumber &&
          gameActive
        ) {

          roundNumber = rn;

          currentRoundId++;

          const me =
            getMe();

          if (!me) return;

          const q =
            room.question;

          if (!q) return;

          mathAnswer =
            Number(q.answer);

          mathChoices =
            q.choices ||
            makeChoices(
              mathAnswer
            );

          humanAnswered =
            false;

          const onGold =
            !!q.gold;

          if (onGold) {

            showOnlineGoldQuestion(
              me,
              q,
              currentRoundId
            );

          } else {

            showOnlineNormalQuestion(
              me,
              q,
              currentRoundId
            );
          }
        }
      }
    );
  }

  function showOnlineNormalQuestion(
    me,
    q,
    myRoundId
  ) {

    if (mathExprEl) {
      mathExprEl.textContent =
        q.expr;
    }

    buildRaceStrip(
      mathRaceList
    );

    buildChoices(
      choicesGrid,
      mathChoices,
      chosen => {

        if (
          humanAnswered ||
          currentRoundId !==
            myRoundId
        ) {
          return;
        }

        humanAnswered = true;

        const correct =
          Number(chosen) ===
          Number(mathAnswer);

        lockChoices(
          choicesGrid,
          mathAnswer,
          chosen
        );

        updateRaceRow(
          mathRaceList,
          MY_ID,
          correct
        );

        submitOnlineMove(
          correct,
          false
        );

        closeDrawer();
      }
    );

    openDrawer(false);

    startTimer(
      mathDeadlineEl,
      MATH_TIME[difficulty],
      () => {

        if (
          humanAnswered
        ) {
          return;
        }

        humanAnswered = true;

        submitOnlineMove(
          false,
          false
        );

        closeDrawer();
      }
    );
  }

  function showOnlineGoldQuestion(
    me,
    q,
    myRoundId
  ) {

    if (goldExprEl) {
      goldExprEl.textContent =
        q.expr;
    }

    buildRaceStrip(
      goldRaceList
    );

    buildChoices(
      goldChoices,
      mathChoices,
      chosen => {

        if (
          humanAnswered ||
          currentRoundId !==
            myRoundId
        ) {
          return;
        }

        humanAnswered = true;

        const correct =
          Number(chosen) ===
          Number(mathAnswer);

        lockChoices(
          goldChoices,
          mathAnswer,
          chosen
        );

        updateRaceRow(
          goldRaceList,
          MY_ID,
          correct
        );

        submitOnlineMove(
          correct,
          true
        );

        closeDrawer();
      }
    );

    openDrawer(true);

    startTimer(
      goldDeadlineEl,
      MATH_TIME[difficulty],
      () => {

        if (
          humanAnswered
        ) {
          return;
        }

        humanAnswered = true;

        submitOnlineMove(
          false,
          true
        );

        closeDrawer();
      }
    );
  }

  function submitOnlineMove(
    correct,
    gold
  ) {

    if (!isOnline) return;

    const me =
      getMe();

    if (!me) return;

    let delta = 0;

    if (correct) {
      delta =
        gold
          ? randInt(1, 3)
          : 1;
    } else if (gold) {
      delta =
        -randInt(1, 3);
    }

    if (delta !== 0) {

      applyMove(
        MY_ID,
        delta
      );
    }
  }

  /* =====================================================
     BOT SYSTEM
  ===================================================== */

  function scheduleBotsOnly(
    myRoundId
  ) {

    if (isOnline) {
      return;
    }

    const timeLimit =
      MATH_TIME[difficulty] ||
      20000;

    runBots(
      myRoundId,
      timeLimit,
      false
    );

    setTimeout(
      () => {

        if (
          currentRoundId ===
          myRoundId
        ) {
          scheduleNextRound();
        }

      },
      timeLimit + 400
    );
  }

  function runBots(
    myRoundId,
    timeLimit,
    onGold
  ) {

    if (isOnline) {
      return;
    }

    flushPendingBots();

    botTimeouts.forEach(
      t =>
        clearTimeout(t)
    );

    botTimeouts = [];

    pendingBots = [];

    const cfg =
      BOT_THINK[difficulty];

    for (
      let i = 0;
      i < players.length;
      i++
    ) {

      const p =
        players[i];

      if (
        Number(p.id) ===
        MY_ID
      ) {
        continue;
      }

      if (
        p.finished ||
        p.eliminated
      ) {
        continue;
      }

      const think =
        Math.round(
          timeLimit *
          (
            cfg.minFrac +
            Math.random() *
            (
              cfg.maxFrac -
              cfg.minFrac
            )
          )
        );

      const correct =
        Math.random() <
        cfg.correctChance;

      const pb = {
        i,
        correct,
        onGold,
        resolved: false
      };

      pendingBots.push(
        pb
      );

      const t =
        setTimeout(
          () => {

            if (
              !gameActive ||
              currentRoundId !==
                myRoundId
            ) {
              return;
            }

            resolveBot(
              pb
            );

          },
          think
        );

      botTimeouts.push(t);
    }
  }

  function resolveBot(
    pb
  ) {

    if (
      !pb ||
      pb.resolved
    ) {
      return;
    }

    pb.resolved = true;

    if (pb.correct) {

      const d =
        pb.onGold
          ? randInt(1, 3)
          : 1;

      applyMove(
        players[pb.i].id,
        d
      );

    } else if (
      pb.onGold
    ) {

      const d =
        randInt(1, 3);

      applyMove(
        players[pb.i].id,
        -d
      );
    }

    const p =
      players[pb.i];

    updateRaceRow(
      pb.onGold
        ? goldRaceList
        : mathRaceList,
      p.id,
      pb.correct
    );
  }

  function flushPendingBots() {

    if (isOnline) {
      return;
    }

    pendingBots.forEach(
      resolveBot
    );
  }

  function scheduleNextRound() {

    if (!gameActive) return;

    setTimeout(
      () => {

        if (
          gameActive
        ) {

          if (isOnline) {

            /*
             * Online ไม่ให้ทุกเครื่อง
             * สร้างรอบเอง
             */

            if (
              onlineIsHost
            ) {
              startRound();
            }

          } else {

            startRound();

          }
        }

      },
      NEXT_ROUND_MS
    );
  }

  /* =====================================================
     BURST
  ===================================================== */

  function showBurst(
    iconOrSuccess,
    customText,
    onDone
  ) {

    let icon;
    let text;

    if (
      iconOrSuccess === true
    ) {

      icon = "✅";
      text = "สำเร็จ!";

    } else if (
      iconOrSuccess === false
    ) {

      icon = "❌";
      text = "ผิดพลาด!";

    } else {

      icon =
        iconOrSuccess;

      text =
        customText || "";
    }

    if (burstIcon) {
      burstIcon.textContent =
        icon;
    }

    if (burstText) {
      burstText.textContent =
        text;
    }

    successBurst?.classList.add(
      "show"
    );

    setTimeout(
      () => {

        successBurst?.classList.remove(
          "show"
        );

        setTimeout(
          onDone,
          60
        );

      },
      BURST_MS
    );
  }

  /* =====================================================
     PUZZLE RESULT
  ===================================================== */

  function showPuzzleResult(
    correct,
    ev,
    steps,
    onDone
  ) {

    if (prcIcon) {
      prcIcon.textContent =
        correct
          ? ev.icon
          : "💀";
    }

    if (prcTitle) {
      prcTitle.textContent =
        correct
          ? "บรรลุ!"
          : "บรรลัย!";
    }

    if (prcSub) {

      prcSub.textContent =
        correct
          ? ev.goodLabel(steps)
          : ev.badLabel(steps);
    }

    prcOverlay?.classList.add(
      "show"
    );

    setTimeout(
      () => {

        prcOverlay?.classList.remove(
          "show"
        );

        setTimeout(
          onDone,
          80
        );

      },
      PRC_SHOW_MS
    );
  }

  /* =====================================================
     WALK CUTSCENE
  ===================================================== */

  function showWalkCutscene(
    player,
    fromPos,
    toPos,
    onDone
  ) {

    const target =
      Math.min(
        BOARD_SIZE,
        Math.max(
          0,
          toPos
        )
      );

    const dir =
      target > fromPos
        ? 1
        : -1;

    const steps =
      Math.abs(
        target -
        fromPos
      );

    if (
      steps === 0
    ) {

      onDone();
      return;
    }

    if (!cutsceneTrack) {

      onDone();
      return;
    }

    cutsceneTrack.innerHTML = "";

    const cells = [];

    for (
      let i = 0;
      i <= steps;
      i++
    ) {

      const val =
        fromPos +
        dir * i;

      if (
        val < 0 ||
        val > BOARD_SIZE
      ) {
        break;
      }

      cells.push(val);

      const wc =
        document.createElement(
          "div"
        );

      wc.className =
        "wc" +
        (
          val === fromPos
            ? " wc-start"
            : val === target
              ? " wc-end"
              : ""
        );

      if (
        PUZZLE_CELLS.includes(
          val
        )
      ) {

        wc.classList.add(
          "wc-gold"
        );
      }

      if (
        val > 0 &&
        val <= lavaLevel
      ) {

        wc.classList.add(
          "wc-lava"
        );
      }

      const sp =
        document.createElement(
          "span"
        );

      sp.textContent =
        val;

      wc.appendChild(sp);

      wc.id =
        `wc-${val}`;

      cutsceneTrack.appendChild(
        wc
      );
    }

    if (cutsceneAvatar) {

      cutsceneAvatar.textContent =
        player.emoji;

      cutsceneAvatar.style.color =
        player.color;

      cutsceneAvatar.style.transform =
        "translateX(0px)";
    }

    if (cutsceneCaption) {

      cutsceneCaption.textContent =
        dir > 0
          ? `${player.name} เดินหน้า ${steps} ช่อง...`
          : `${player.name} ถอยหลัง ${steps} ช่อง...`;
    }

    cutsceneWalk?.classList.add(
      "show"
    );

    let step = 0;

    function doStep() {

      if (!gameActive) {

        cutsceneWalk?.classList.remove(
          "show"
        );

        onDone();

        return;
      }

      if (step > 0) {

        const prev =
          $(
            `wc-${cells[step - 1]}`
          );

        prev?.classList.remove(
          "wc-active"
        );
      }

      const cur =
        $(
          `wc-${cells[step]}`
        );

      if (cur) {

        cur.classList.add(
          "wc-active"
        );

        cur.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest"
        });

        const trackRect =
          cutsceneTrack.getBoundingClientRect();

        const curRect =
          cur.getBoundingClientRect();

        const offsetX =
          curRect.left -
          trackRect.left +
          curRect.width / 2 -
          20;

        if (cutsceneAvatar) {

          cutsceneAvatar.style.transform =
            `translateX(${offsetX}px)`;
        }
      }

      step++;

      if (
        step < cells.length
      ) {

        setTimeout(
          doStep,
          WALK_STEP_MS
        );

      } else {

        setTimeout(
          () => {

            cutsceneWalk?.classList.remove(
              "show"
            );

            setTimeout(
              onDone,
              80
            );

          },
          380
        );
      }
    }

    setTimeout(
      doStep,
      100
    );
  }

  /* =====================================================
     MOVEMENT
  ===================================================== */

  function applyMove(
    id,
    delta
  ) {

    const p =
      getPlayerById(id);

    if (!p) return;

    if (
      p.finished ||
      p.eliminated
    ) {
      return;
    }

    const oldPos =
      p.pos;

    p.pos =
      Math.min(
        BOARD_SIZE,
        Math.max(
          0,
          p.pos + delta
        )
      );

    /*
     * โดนลาวา
     */

    if (
      p.pos <= lavaLevel &&
      p.pos > 0
    ) {

      eliminatePlayer(
        p
      );

      return;
    }

    /*
     * ถึงเส้นชัย
     */

    const justFinished =
      p.pos >= BOARD_SIZE &&
      !p.finished;

    if (justFinished) {

      p.finished = true;

      p.finishRank =
        players.filter(
          x =>
            x.finished
        ).length + 1;
    }

    renderTokens(
      id
    );

    renderScoreboard(
      id
    );

    if (
      Number(id) ===
      MY_ID
    ) {

      zoomToPlayer();

      /*
       * Online sync
       */

      if (isOnline) {

        playersRef
          ?.child(
            String(MY_ID)
          )
          .update({
            pos: p.pos,
            finished:
              p.finished,
            eliminated:
              p.eliminated,
            finishRank:
              p.finishRank ??
              null
          });
      }
    }

    /*
     * ชนะ
     */

    if (
      justFinished &&
      p.finishRank === 1
    ) {

      if (isOnline) {

        roomRef?.update({
          status: "finished",
          winnerId:
            Number(p.id)
        });
      }

      setTimeout(
        () => {

          stopAll();

          showWinScreen(
            p
          );

        },
        300
      );
    }

    return oldPos;
  }

  /* =====================================================
     WIN
  ===================================================== */

  function showWinScreen(
    winner
  ) {

    gameActive = false;

    clearInterval(
      mathTimerInterval
    );

    closeDrawer();

    if (!modalWin) return;

    winName.textContent =
      winner
        ? `${winner.emoji} ${winner.name} รอดแล้ว! 🎉`
        : "เกมจบแล้ว";

    winSub.textContent =
      winner
        ? "หนีออกจากถ้ำก่อนลาวาจะไหลถึง"
        : "ผลการแข่งขันปัจจุบัน";

    winRankList.innerHTML = "";

    const medals = [
      "🥇",
      "🥈",
      "🥉",
      "4️⃣",
      "5️⃣"
    ];

    [
      ...players
    ]
      .sort(
        (a, b) =>
          b.pos -
          a.pos
      )
      .forEach(
        (pl, idx) => {

          const row =
            document.createElement(
              "div"
            );

          row.className =
            "rank-row";

          const med =
            document.createElement(
              "div"
            );

          med.className =
            "rank-medal";

          med.textContent =
            medals[idx] ||
            "—";

          const nm =
            document.createElement(
              "div"
            );

          nm.className =
            "rank-name";

          nm.textContent =
            `${pl.emoji} ${pl.name}`;

          const ps =
            document.createElement(
              "div"
            );

          ps.className =
            "rank-pos";

          ps.textContent =
            pl.eliminated
              ? "💀 โดนลาวา"
              : pl.finished
                ? "ช่อง 50 ✓"
                : `ช่อง ${pl.pos}`;

          row.appendChild(
            med
          );

          row.appendChild(
            nm
          );

          row.appendChild(
            ps
          );

          winRankList.appendChild(
            row
          );
        }
      );

    modalWin.classList.add(
      "show"
    );
  }

  /* =====================================================
     MATH
  ===================================================== */

  function randInt(
    a,
    b
  ) {

    return Math.floor(
      Math.random() *
      (b - a + 1)
    ) + a;
  }

  function generateQuestion(
    diff
  ) {

    let a, b, c, d;
    let expr;
    let answer;

    if (
      diff === "easy"
    ) {

      const op =
        ["+", "-"][
          randInt(0, 1)
        ];

      a =
        randInt(1, 20);

      b =
        randInt(1, 20);

      if (
        op === "-" &&
        b > a
      ) {

        [
          a,
          b
        ] = [
          b,
          a
        ];
      }

      answer =
        op === "+"
          ? a + b
          : a - b;

      expr =
        `${a} ${op} ${b}`;

    } else if (
      diff === "medium"
    ) {

      const p =
        randInt(0, 2);

      if (p === 0) {

        a =
          randInt(2, 12);

        b =
          randInt(2, 12);

        answer =
          a * b;

        expr =
          `${a} × ${b}`;

      } else if (
        p === 1
      ) {

        answer =
          randInt(2, 12);

        b =
          randInt(2, 9);

        a =
          answer * b;

        expr =
          `${a} ÷ ${b}`;

      } else {

        a =
          randInt(2, 12);

        b =
          randInt(2, 12);

        c =
          randInt(1, 15);

        answer =
          a * b + c;

        expr =
          `${a} × ${b} + ${c}`;
      }

    } else {

      const p =
        randInt(0, 2);

      if (p === 0) {

        a =
          randInt(10, 30);

        b =
          randInt(2, 9);

        c =
          randInt(2, 9);

        answer =
          a - b * c;

        expr =
          `${a} - ${b} × ${c}`;

      } else if (
        p === 1
      ) {

        a =
          randInt(2, 12);

        b =
          randInt(2, 12);

        c =
          randInt(1, 20);

        answer =
          a * b - c;

        expr =
          `${a} × ${b} - ${c}`;

      } else {

        b =
          randInt(2, 9);

        const q =
          randInt(2, 12);

        a =
          q * b;

        c =
          randInt(2, 9);

        d =
          randInt(1, 10);

        answer =
          q + c * d;

        expr =
          `${a} ÷ ${b} + ${c} × ${d}`;
      }
    }

    return {
      diff,
      expr,
      answer
    };
  }

  function makeChoices(
    correct
  ) {

    const s =
      new Set([
        correct
      ]);

    let t = 0;

    while (
      s.size < 4 &&
      t < 60
    ) {

      t++;

      const sp =
        Math.max(
          3,
          Math.ceil(
            Math.abs(
              correct
            ) * 0.4
          )
        );

      const w =
        correct +
        (
          Math.random() < 0.5
            ? 1
            : -1
        ) *
        randInt(
          1,
          sp
        );

      if (
        w !== correct
      ) {
        s.add(w);
      }
    }

    return shuffle(
      [...s]
    );
  }

  function shuffle(a) {

    return a.sort(
      () =>
        Math.random() -
        0.5
    );
  }

  function diffLabel2(
    d
  ) {

    return d === "easy"
      ? "ง่าย"
      : d === "medium"
        ? "ปานกลาง"
        : "ยาก";
  }

  /* =====================================================
     BOOT
  ===================================================== */

  if (
    isOnline &&
    !firebaseReady()
  ) {

    console.error(
      "❌ Firebase ยังไม่พร้อมใช้งาน"
    );

    alert(
      "ไม่สามารถเชื่อม Firebase ได้\nกรุณาตรวจสอบ firebase-config.js"
    );

    return;
  }

  initGame();

})();
