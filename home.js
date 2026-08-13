/* home.js — index.html */
(function () {
  "use strict";

  /*
   * ONLINE ONLY
   * ไม่จำกัดจำนวนผู้เล่น
   */
  const NUM_PLAYERS = 999;

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

  /* ─────────────────────────────
     Firebase
  ───────────────────────────── */

  function checkFirebase() {
    return (
      typeof firebase !== "undefined" &&
      firebase.apps &&
      firebase.apps.length > 0 &&
      typeof DB !== "undefined"
    );
  }

  /* ─────────────────────────────
     Cave atmosphere
  ───────────────────────────── */

  function buildAtmosphere() {
    const stal =
      document.getElementById("stalactites");

    if (stal) {
      for (let i = 0; i < 28; i++) {
        const s =
          document.createElement("div");

        s.className =
          "stalactite";

        const w =
          12 + Math.random() * 22;

        const h =
          30 + Math.random() * 120;

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
      document.getElementById("embers");

    if (em) {
      for (let i = 0; i < 20; i++) {
        const e =
          document.createElement("div");

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

  /* ─────────────────────────────
     Player inputs
  ───────────────────────────── */

  function buildPlayerInputs() {
    const wrap =
      document.getElementById(
        "player-inputs"
      );

    if (!wrap) return;

    wrap.innerHTML = "";

    /*
     * หน้านี้ไม่ใช้ Local/Bot แล้ว
     * จึงไม่สร้างรายการผู้เล่นแบบเดิม
     */
  }

  /* ─────────────────────────────
     Mode
  ───────────────────────────── */

  let onlineDiff = "medium";

  document
    .querySelectorAll(".mode-tab")
    .forEach(tab => {

      tab.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(".mode-tab")
            .forEach(t =>
              t.classList.remove(
                "active"
              )
            );

          document
            .querySelectorAll(".mode-panel")
            .forEach(p =>
              p.classList.remove(
                "active"
              )
            );

          tab.classList.add(
            "active"
          );

          document
            .getElementById(
              `panel-${tab.dataset.mode}`
            )
            ?.classList.add(
              "active"
            );
        }
      );
    });

  document
    .querySelectorAll(
      'input[name="online-difficulty"]'
    )
    .forEach(r => {

      r.addEventListener(
        "change",
        e => {
          onlineDiff =
            e.target.value;
        }
      );

    });

  /* ─────────────────────────────
     ONLINE ONLY
  ───────────────────────────── */

  const localStartButton =
    document.getElementById(
      "btn-start-local"
    );

  if (localStartButton) {
    localStartButton.style.display =
      "none";

    localStartButton.disabled =
      true;
  }

  /* ─────────────────────────────
     Generate room code
  ───────────────────────────── */

  function generateRoomCode() {
    return Math.floor(
      1000 +
      Math.random() * 9000
    ).toString();
  }

  /* ─────────────────────────────
     Create room
  ───────────────────────────── */

  document
    .getElementById(
      "btn-create-room"
    )
    ?.addEventListener(
      "click",
      async () => {

        const name =
          (
            document.getElementById(
              "online-name-create"
            )?.value || ""
          ).trim();

        if (!name) {
          setStatus(
            "กรุณาใส่ชื่อของคุณก่อน",
            "err"
          );

          return;
        }

        if (!checkFirebase()) {
          setStatus(
            "Firebase ยังไม่เชื่อมต่อ กรุณาตรวจสอบ firebase-config.js",
            "err"
          );

          console.error(
            "Firebase ไม่พร้อมใช้งาน"
          );

          return;
        }

        setStatus(
          "กำลังสร้างห้อง...",
          "loading"
        );

        try {

          let roomCreated =
            false;

          let roomCode = "";

          for (
            let attempt = 0;
            attempt < 10;
            attempt++
          ) {

            const code =
              generateRoomCode();

            const roomRef =
              DB.ref(
                `rooms/${code}`
              );

            const result =
              await roomRef.transaction(
                current => {

                  if (
                    current !== null
                  ) {
                    return;
                  }

                  return {
                    status:
                      "waiting",

                    hostId:
                      0,

                    difficulty:
                      onlineDiff,

                    createdAt:
                      firebase
                        .database
                        .ServerValue
                        .TIMESTAMP,

                    startAt:
                      0,

                    roundNumber:
                      1,

                    roundId:
                      0,

                    lavaLevel:
                      0,

                    puzzleCells:
                      [],

                    players: {
                      0: {
                        id: 0,
                        name: name,
                        color:
                          PLAYER_COLORS[0],
                        emoji:
                          PLAYER_EMOJIS[0],
                        pos: 0,
                        finished:
                          false,
                        eliminated:
                          false,
                        finishRank:
                          null,
                        connected:
                          true
                      }
                    }
                  };
                }
              );

            if (
              result.committed
            ) {

              roomCreated =
                true;

              roomCode =
                code;

              break;
            }
          }

          if (!roomCreated) {
            throw new Error(
              "ไม่สามารถสร้างรหัสห้องได้"
            );
          }

          const me = {
            id: 0,
            name: name,
            color:
              PLAYER_COLORS[0],
            emoji:
              PLAYER_EMOJIS[0]
          };

          sessionStorage.setItem(
            "game_mode",
            "online"
          );

          sessionStorage.setItem(
            "game_difficulty",
            onlineDiff
          );

          sessionStorage.setItem(
            "online_room",
            roomCode
          );

          sessionStorage.setItem(
            "online_me",
            JSON.stringify(me)
          );

          sessionStorage.setItem(
            "online_isHost",
            "1"
          );

          window.location.href =
            "game.html";

        } catch (error) {

          console.error(
            "Create room error:",
            error
          );

          setStatus(
            "สร้างห้องไม่สำเร็จ: " +
            (
              error.message ||
              error
            ),
            "err"
          );
        }
      }
    );

  /* ─────────────────────────────
     Join room
  ───────────────────────────── */

  document
    .getElementById(
      "btn-join-room"
    )
    ?.addEventListener(
      "click",
      async () => {

        const code =
          (
            document.getElementById(
              "room-code-input"
            )?.value || ""
          ).trim();

        const name =
          (
            document.getElementById(
              "online-name-join"
            )?.value || ""
          ).trim();

        if (
          code.length !== 4 ||
          isNaN(code)
        ) {

          setStatus(
            "รหัสห้องต้องเป็นตัวเลข 4 หลัก",
            "err"
          );

          return;
        }

        if (!name) {

          setStatus(
            "กรุณาใส่ชื่อของคุณก่อน",
            "err"
          );

          return;
        }

        if (!checkFirebase()) {

          setStatus(
            "Firebase ยังไม่เชื่อมต่อ",
            "err"
          );

          return;
        }

        setStatus(
          "กำลังตรวจสอบห้อง...",
          "loading"
        );

        try {

          const roomRef =
            DB.ref(
              `rooms/${code}`
            );

          const snapshot =
            await roomRef.once(
              "value"
            );

          if (
            !snapshot.exists()
          ) {

            setStatus(
              "ไม่พบห้องนี้ กรุณาตรวจสอบรหัสอีกครั้ง",
              "err"
            );

            return;
          }

          const room =
            snapshot.val() || {};

          if (
            room.status ===
            "playing"
          ) {

            setStatus(
              "เกมเริ่มไปแล้ว ไม่สามารถเข้าห้องได้",
              "err"
            );

            return;
          }

          const players =
            room.players || {};

          const usedIds =
            Object.keys(players)
              .map(Number);

          /*
           * ไม่จำกัด 5 คน
           *
           * หา ID ใหม่ที่ไม่ซ้ำ
           */

          let playerId = 0;

          while (
            usedIds.includes(
              playerId
            )
          ) {
            playerId++;
          }

          const me = {

            id: playerId,

            name: name,

            color:
              PLAYER_COLORS[
                playerId %
                PLAYER_COLORS.length
              ],

            emoji:
              PLAYER_EMOJIS[
                playerId %
                PLAYER_EMOJIS.length
              ]
          };

          await roomRef
            .child(
              `players/${playerId}`
            )
            .set({

              id: playerId,

              name: name,

              color:
                me.color,

              emoji:
                me.emoji,

              pos: 0,

              finished:
                false,

              eliminated:
                false,

              finishRank:
                null,

              connected:
                true
            });

          sessionStorage.setItem(
            "game_mode",
            "online"
          );

          sessionStorage.setItem(
            "game_difficulty",
            room.difficulty ||
            onlineDiff
          );

          sessionStorage.setItem(
            "online_room",
            code
          );

          sessionStorage.setItem(
            "online_me",
            JSON.stringify(me)
          );

          sessionStorage.setItem(
            "online_isHost",
            "0"
          );

          window.location.href =
            "game.html";

        } catch (error) {

          console.error(
            "Join room error:",
            error
          );

          setStatus(
            "เข้าห้องไม่สำเร็จ: " +
            (
              error.message ||
              error
            ),
            "err"
          );
        }
      }
    );

  /* ─────────────────────────────
     Status
  ───────────────────────────── */

  function setStatus(
    msg,
    cls
  ) {

    const el =
      document.getElementById(
        "online-status"
      );

    if (!el) return;

    el.textContent =
      msg;

    el.className =
      "online-status " +
      cls;
  }

  /* ─────────────────────────────
     Room code input
  ───────────────────────────── */

  document
    .getElementById(
      "room-code-input"
    )
    ?.addEventListener(
      "input",
      function () {

        this.value =
          this.value
            .replace(/\D/g, "")
            .slice(0, 4);

      }
    );

  /* ─────────────────────────────
     Boot
  ───────────────────────────── */

  buildAtmosphere();

  buildPlayerInputs();

})();
