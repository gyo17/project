/* ═══════════════════════════════════════════════════════
   game.js  —  จะบรรลุหรือจะบรรลัย (cave theme)
   Rewritten to match game.html exactly (drawer UI, cutscene walk,
   puzzle-result card, single reusable burst overlay).
═══════════════════════════════════════════════════════ */
(function(){
"use strict";

/* ── Config ──────────────────────────────────────── */
const BOARD_SIZE        = 50;
const PUZZLE_CELL_COUNT = 10;
const MATH_TIME         = { easy:15000, medium:20000, hard:25000 };
const WALK_STEP_MS      = 260;
const BURST_MS          = 1000;
const PRC_SHOW_MS       = 1600;
const NEXT_ROUND_MS     = 300;
const LAVA_INTERVAL_MS  = 10000;

const BOT_THINK = {
  easy:   { minFrac:.55, maxFrac:.95, correctChance:.65 },
  medium: { minFrac:.40, maxFrac:.92, correctChance:.75 },
  hard:   { minFrac:.28, maxFrac:.88, correctChance:.85 },
};

const PLAYER_COLORS = ["#FF5722","#00E5FF","#FFD600","#8BC34A","#E040FB"];
const PLAYER_EMOJIS = ["🧑","🧒","👩","🧔","👧"];

const PUZZLE_EVENTS = [
  { icon:"⭐", goodLabel:n=>`บรรลุ! เดินหน้า ${n} ช่อง 🎉`,   badLabel:n=>`บรรลัย... ถอยหลัง ${n} ช่อง 💀` },
  { icon:"🌋", goodLabel:n=>`รอดลาวา! วิ่งหน้า ${n} ช่อง 🏃`, badLabel:n=>`โดนลาวา! ถอย ${n} ช่อง 🔥` },
  { icon:"⚡", goodLabel:n=>`ทางลัด! +${n} ช่อง ⚡`,          badLabel:n=>`หลงทาง -${n} ช่อง 🕸️` },
  { icon:"🕸️",goodLabel:n=>`แหกกับดัก! ไป ${n} ช่อง 💪`,     badLabel:n=>`ติดใย ถอย ${n} ช่อง 😱` },
];

/* ── Session ─────────────────────────────────────── */
const difficulty = sessionStorage.getItem("game_difficulty") || "medium";
const rawPlayers = JSON.parse(sessionStorage.getItem("game_players") || "null")
  || PLAYER_COLORS.map((c,i)=>({ id:i, name:i===0?"คุณ":`บอท ${i}`, color:c, emoji:PLAYER_EMOJIS[i] }));

/* ── State ───────────────────────────────────────── */
let players=[], roundNumber=0, gameActive=false, currentRoundId=0;
let mathAnswer=null, mathChoices=[], humanAnswered=false;
let botTimeouts=[], mathTimerInterval=null;
let PUZZLE_CELLS=[];
let lavaLevel=0;
let lavaInterval=null;

/* ── Audio (Web Audio API) ───────────────────────── */
let audioCtx=null;
function getAudio(){ if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
function beep(freqs,type,dur,gap,vol){
  try{
    const ctx=getAudio();
    freqs.forEach((f,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type=type; o.frequency.value=f;
      const t=ctx.currentTime+i*gap;
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.04);
      g.gain.exponentialRampToValueAtTime(.001,t+dur);
      o.start(t); o.stop(t+dur);
    });
  }catch(e){}
}
function playSuccess(){ beep([523,659,784,1046],"sine",.24,.12,.22); }
function playFail(){ beep([220,180,140],"sawtooth",.28,.15,.18); }
function playLavaRise(){
  try{
    const ctx=getAudio();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type="sawtooth"; o.frequency.setValueAtTime(120,ctx.currentTime);
    o.frequency.linearRampToValueAtTime(60,ctx.currentTime+.6);
    g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(.25,ctx.currentTime+.1);
    g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.6);
    o.start(); o.stop(ctx.currentTime+.6);
  }catch(e){}
}

/* ── DOM ─────────────────────────────────────────── */
const $=id=>document.getElementById(id);
const boardEl       = $("board");
const scoreboardEl  = $("scoreboard");
const roundLabel    = $("round-label");
const diffLabel     = $("difficulty-label");
const puzzleCount   = $("puzzle-cell-count");

const drawer         = $("question-drawer");
const qpNormal        = $("qpanel-normal");
const qpGold          = $("qpanel-gold");
const mathDiffEl      = $("math-difficulty");
const mathDeadlineEl  = $("math-deadline");
const mathExprEl      = $("math-expression");
const choicesGrid     = $("choices-grid");
const mathRaceList    = $("math-race-list");
const myPosNum        = $("my-pos-num");
const goldDeadlineEl  = $("gold-deadline");
const goldExprEl      = $("gold-expression");
const goldChoices     = $("gold-choices-grid");
const goldRaceList    = $("gold-race-list");
const goldEyebrow     = $("gold-eyebrow");
const goldFlavor      = $("gold-flavor");

const successBurst  = $("success-burst");
const burstIcon     = $("burst-icon");
const burstText     = $("burst-text");

const cutsceneWalk  = $("cutscene-walk");
const cutsceneTrack = $("cutscene-track");
const cutsceneAvatar= $("cutscene-avatar");
const cutsceneCaption=$("cutscene-caption");

const prcOverlay    = $("puzzle-result-overlay");
const prcIcon       = $("prc-icon");
const prcTitle      = $("prc-title");
const prcSub        = $("prc-sub");

const modalConfirm  = $("modal-confirm");
const confirmTitle  = $("confirm-title");
const confirmMsg    = $("confirm-msg");
const confirmOk     = $("confirm-ok");
const confirmCancel = $("confirm-cancel");

const modalWin      = $("modal-win");
const winName       = $("win-name");
const winSub        = $("win-sub");
const winRankList   = $("win-rank-list");

const lavaFlashEl   = $("lava-flash");

/* ── Confirm dialog ──────────────────────────────── */
function showConfirm(title,msg,onOk){
  confirmTitle.textContent=title; confirmMsg.textContent=msg;
  modalConfirm.classList.add("show");
  const cleanup=()=>{ confirmOk.removeEventListener("click",ok); confirmCancel.removeEventListener("click",cancel); modalConfirm.classList.remove("show"); };
  const ok=()=>{ cleanup(); onOk(); };
  const cancel=()=>{ cleanup(); };
  confirmOk.addEventListener("click",ok);
  confirmCancel.addEventListener("click",cancel);
}

/* ── Nav ─────────────────────────────────────────── */
$("btn-back-home")?.addEventListener("click",e=>{ e.stopPropagation(); showConfirm("🏠 กลับหน้าหลัก","เกมจะยุติ ต้องการกลับจริงๆ ไหม?",()=>{ stopAll(); location.href="index.html"; }); });
$("btn-stop-game")?.addEventListener("click",e=>{ e.stopPropagation(); if(!gameActive) return; showConfirm("⏹ หยุดเกม","ต้องการหยุดเกมไหม?",()=>{ stopAll(); showWinScreen(null); }); });
$("btn-exit-q")?.addEventListener("click",e=>{ e.stopPropagation(); showConfirm("🏠 ออกเกม","ต้องการออกจากเกมไหม?",()=>{ stopAll(); location.href="index.html"; }); });
$("btn-exit-gold")?.addEventListener("click",e=>{ e.stopPropagation(); showConfirm("🏠 ออกเกม","ต้องการออกจากเกมไหม?",()=>{ stopAll(); location.href="index.html"; }); });
$("btn-play-again")?.addEventListener("click",()=>location.reload());
$("btn-home-from-win")?.addEventListener("click",()=>{ location.href="index.html"; });

function stopAll(){
  gameActive=false; currentRoundId++;
  clearInterval(mathTimerInterval); clearInterval(lavaInterval);
  botTimeouts.forEach(t=>clearTimeout(t)); botTimeouts=[];
  closeDrawer();
  successBurst.classList.remove("show");
  cutsceneWalk.classList.remove("show");
  prcOverlay.classList.remove("show");
}

/* ── Atmosphere ──────────────────────────────────── */
function buildAtmosphere(){
  const stal=$("stalactites");
  if(stal && !stal.dataset.built){
    stal.dataset.built="1";
    for(let i=0;i<24;i++){
      const s=document.createElement("div");
      s.className="stalactite";
      const w=12+Math.random()*22, h=26+Math.random()*100;
      s.style.cssText=`border-left-width:${w/2}px;border-right-width:${w/2}px;border-top-width:${h}px;border-top-color:hsl(${260+Math.random()*20},${30+Math.random()*15}%,${10+Math.random()*10}%);animation-delay:${Math.random()*3}s;animation-duration:${2.5+Math.random()*2}s;flex:0 0 auto;`;
      stal.appendChild(s);
    }
  }
  const em=$("embers");
  if(em && !em.dataset.built){
    em.dataset.built="1";
    for(let i=0;i<20;i++){
      const e=document.createElement("div");
      e.className="ember";
      e.style.cssText=`left:${Math.random()*100}%;--drift:${(Math.random()-.5)*60}px;animation-duration:${4+Math.random()*5}s;animation-delay:${Math.random()*6}s;`;
      em.appendChild(e);
    }
  }
}

/* ── Board ───────────────────────────────────────── */
function buildBoard(){
  boardEl.innerHTML="";
  const rows=[];
  for(let r=0;r<5;r++){ let v=Array.from({length:10},(_,c)=>r*10+c+1); if(r%2===1) v.reverse(); rows.push(v); }
  for(let r=4;r>=0;r--){
    rows[r].forEach(val=>{
      const cell=document.createElement("div");
      cell.className="cell"; cell.dataset.cell=val;
      const ns=document.createElement("span"); ns.className="cell-num"; ns.textContent=val; cell.appendChild(ns);
      if(val===1)          cell.classList.add("is-start");
      if(val===BOARD_SIZE) cell.classList.add("is-finish");
      if(PUZZLE_CELLS.includes(val)) cell.classList.add("is-puzzle-gold");
      const tw=document.createElement("div"); tw.className="cell-tokens"; tw.id=`tokens-${val}`; cell.appendChild(tw);
      boardEl.appendChild(cell);
    });
  }
}

function renderTokens(highlightId=null){
  document.querySelectorAll(".cell-tokens").forEach(el=>el.innerHTML="");
  players.forEach(p=>{
    if(p.pos<1||p.eliminated) return;
    const wrap=$(`tokens-${p.pos}`); if(!wrap) return;
    const dot=document.createElement("div");
    dot.className="token-dot"+(p.id===highlightId?" just-moved":"");
    dot.style.background=p.color; dot.textContent=p.emoji; dot.title=p.name;
    wrap.appendChild(dot);
  });
}

function zoomToPlayer(){
  const me=players[0]; if(!me||me.pos<1) return;
  const cellEl=document.querySelector(`.cell[data-cell="${me.pos}"]`);
  if(cellEl) cellEl.scrollIntoView({ behavior:"smooth", block:"center", inline:"center" });
}

/* ── Scoreboard ──────────────────────────────────── */
function renderScoreboard(flashId=null){
  scoreboardEl.innerHTML="";
  players.forEach(p=>{
    const row=document.createElement("div");
    row.className="score-row"+(p.id===flashId?" just-moved":"");
    if(p.eliminated) row.style.opacity=".45";
    const tok=document.createElement("div"); tok.className="score-token";
    tok.style.background=p.color+"33"; tok.style.border=`2px solid ${p.color}`;
    tok.textContent=p.eliminated?"💀":p.emoji;
    const info=document.createElement("div"); info.className="score-info";
    const nm=document.createElement("div"); nm.className="score-name"; nm.textContent=p.name;
    const ps=document.createElement("div"); ps.className="score-pos";
    ps.textContent=p.eliminated?"ถูกลาวา":p.pos===0?"จุดเริ่มต้น":`ช่อง ${p.pos}`;
    info.appendChild(nm); info.appendChild(ps);
    const st=document.createElement("div"); st.className="score-status"; st.textContent=p.finished?"🏁":"";
    row.appendChild(tok); row.appendChild(info); row.appendChild(st);
    scoreboardEl.appendChild(row);
  });
}

/* ── Race strip ──────────────────────────────────── */
function buildRaceStrip(container){
  container.innerHTML="";
  players.forEach((p,i)=>{
    const row=document.createElement("div"); row.className="race-row"; row.id=`race-${container.id}-${i}`;
    const dot=document.createElement("span"); dot.className="race-dot"; dot.style.background=p.color;
    const nm=document.createElement("span"); nm.className="race-name";
    nm.appendChild(dot); nm.appendChild(document.createTextNode(" "+p.name+(i===0?" (คุณ)":"")));
    const st=document.createElement("span"); st.className="race-status"; st.id=`rst-${container.id}-${i}`;
    st.textContent=p.finished?"🏁":p.eliminated?"💀":"รอ...";
    row.appendChild(nm); row.appendChild(st); container.appendChild(row);
  });
}
function updateRaceRow(container,i,correct){
  const row=document.getElementById(`race-${container.id}-${i}`);
  const st =document.getElementById(`rst-${container.id}-${i}`);
  if(!row||!st) return;
  row.className="race-row"+(correct?" r-correct":" r-wrong");
  st.textContent=correct?"✓ เดิน!":"✗ ผิด";
}

/* ── Choice buttons ──────────────────────────────── */
function buildChoices(grid,choices,onPick){
  grid.innerHTML="";
  choices.forEach(val=>{
    const btn=document.createElement("button"); btn.className="choice-btn"; btn.textContent=val; btn.dataset.val=val;
    btn.addEventListener("click",()=>onPick(val,choices));
    grid.appendChild(btn);
  });
}
function lockChoices(grid,correct,chosen){
  grid.querySelectorAll(".choice-btn").forEach(b=>{
    b.disabled=true;
    if(+b.dataset.val===correct)                    b.classList.add("correct");
    if(+b.dataset.val===chosen && chosen!==correct)  b.classList.add("wrong");
  });
}

/* ── Timer ───────────────────────────────────────── */
function startTimer(el,limitMs,onExpire){
  clearInterval(mathTimerInterval);
  let rem=limitMs;
  const myId=currentRoundId;
  el.textContent=(rem/1000).toFixed(0)+"s";
  mathTimerInterval=setInterval(()=>{
    if(currentRoundId!==myId){ clearInterval(mathTimerInterval); return; }
    rem-=100; const d=Math.max(0,rem/1000);
    el.textContent=d>=10?d.toFixed(0)+"s":d.toFixed(1)+"s";
    if(rem<=0){ clearInterval(mathTimerInterval); if(gameActive) onExpire(); }
  },100);
}

/* ── Drawer ──────────────────────────────────────── */
function openDrawer(gold=false){
  qpNormal.classList.toggle("active", !gold);
  qpGold.classList.toggle("active",  gold);
  drawer.classList.add("open");
}
function closeDrawer(){ drawer.classList.remove("open"); }

/* ── Lava system ─────────────────────────────────── */
function startLava(){
  lavaInterval=setInterval(()=>{
    if(!gameActive) return;
    lavaLevel=Math.min(BOARD_SIZE, lavaLevel+1);
    consumeCell(lavaLevel);
    playLavaRise();
    flashLava();
    players.forEach(p=>{
      if(!p.eliminated && !p.finished && p.pos>0 && p.pos<=lavaLevel) eliminatePlayer(p);
    });
    if(lavaLevel>=BOARD_SIZE){ stopAll(); showWinScreen(null); }
  }, LAVA_INTERVAL_MS);
}
function consumeCell(val){
  const el=document.querySelector(`.cell[data-cell="${val}"]`);
  if(!el) return;
  el.classList.add("lava-eating");
  setTimeout(()=>{ el.classList.remove("lava-eating"); el.classList.add("is-lava-consumed"); }, 500);
}
function flashLava(){
  lavaFlashEl.classList.remove("flash"); void lavaFlashEl.offsetWidth; lavaFlashEl.classList.add("flash");
}
function eliminatePlayer(p){
  if(p.eliminated) return;
  p.eliminated=true;
  renderTokens(); renderScoreboard();
  if(p.id===0){
    showBurst("🔥", `${p.name} โดนลาวา!`, ()=>{ stopAll(); showWinScreen(null); });
  }
}

/* ── GAME INIT ───────────────────────────────────── */
function initGame(){
  players=rawPlayers.map(p=>({...p, pos:0, finished:false, eliminated:false, finishRank:null}));
  roundNumber=0; gameActive=true; currentRoundId=0; lavaLevel=0;

  const diffNames={easy:"🌿 ง่าย",medium:"🔥 ปานกลาง",hard:"💀 ยาก"};
  diffLabel.textContent=diffNames[difficulty]||"🔥 ปานกลาง";

  const pool=Array.from({length:48},(_,i)=>i+2);
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  PUZZLE_CELLS=pool.slice(0,PUZZLE_CELL_COUNT);
  if(puzzleCount) puzzleCount.textContent=PUZZLE_CELLS.length;

  buildAtmosphere();
  buildBoard();
  renderTokens();
  renderScoreboard();
  startLava();
  setTimeout(startRound, 700);
}

/* ── ROUND ───────────────────────────────────────── */
function startRound(){
  if(!gameActive) return;
  const activePlayers=players.filter(p=>!p.finished&&!p.eliminated);
  if(activePlayers.length===0){ stopAll(); showWinScreen(null); return; }

  roundNumber++;
  currentRoundId++;
  const myRoundId=currentRoundId;

  roundLabel.textContent=`รอบที่ ${roundNumber}`;
  const me=players[0];

  if(me.finished||me.eliminated){
    scheduleBotsOnly(myRoundId);
    return;
  }

  const timeLimit=MATH_TIME[difficulty]||20000;
  const q=generateQuestion(difficulty);
  mathAnswer=q.answer; mathChoices=makeChoices(q.answer); humanAnswered=false;

  const onGold=PUZZLE_CELLS.includes(me.pos);

  if(onGold){
    const ev=PUZZLE_EVENTS[Math.floor(Math.random()*PUZZLE_EVENTS.length)];
    goldEyebrow.textContent=`${ev.icon} จะบรรลุหรือจะบรรลัย!`;
    goldFlavor.textContent="ตอบถูก = เดินหน้า | ตอบผิด = ถอยหลัง (สุ่มจำนวนช่อง)";
    goldExprEl.textContent=q.expr;
    buildRaceStrip(goldRaceList);
    buildChoices(goldChoices,mathChoices,(chosen)=>{
      if(humanAnswered||currentRoundId!==myRoundId) return;
      humanAnswered=true; clearInterval(mathTimerInterval);
      const correct=(chosen===mathAnswer);
      lockChoices(goldChoices,mathAnswer,chosen);
      updateRaceRow(goldRaceList,0,correct);
      setTimeout(()=>{
        closeDrawer();
        PUZZLE_CELLS=PUZZLE_CELLS.filter(c=>c!==me.pos);
        const cellEl=document.querySelector(`.cell[data-cell="${me.pos}"]`);
        if(cellEl) cellEl.classList.remove("is-puzzle-gold");
        if(puzzleCount) puzzleCount.textContent=PUZZLE_CELLS.length;
        setTimeout(()=>{
          if(correct) playSuccess(); else playFail();
          const steps=randInt(1,3);
          showPuzzleResult(correct,ev,steps,()=>{
            const delta=correct?steps:-steps;
            const from=me.pos, to=Math.min(BOARD_SIZE,Math.max(0,me.pos+delta));
            if(to!==from){
              showWalkCutscene(me,from,to,()=>{ applyMove(0,delta); scheduleNextRound(); });
            } else {
              scheduleNextRound();
            }
          });
        },350);
      },420);
    });
    openDrawer(true);
    startTimer(goldDeadlineEl,timeLimit,()=>{
      if(humanAnswered||currentRoundId!==myRoundId) return;
      humanAnswered=true; closeDrawer(); setTimeout(()=>scheduleNextRound(),350);
    });
  } else {
    myPosNum.textContent=me.pos;
    mathDiffEl.textContent=diffLabel2(q.diff); mathDiffEl.dataset.level=q.diff;
    mathExprEl.textContent=q.expr;
    buildRaceStrip(mathRaceList);
    buildChoices(choicesGrid,mathChoices,(chosen)=>{
      if(humanAnswered||currentRoundId!==myRoundId) return;
      humanAnswered=true; clearInterval(mathTimerInterval);
      const correct=(chosen===mathAnswer);
      lockChoices(choicesGrid,mathAnswer,chosen);
      updateRaceRow(mathRaceList,0,correct);
      setTimeout(()=>{
        closeDrawer();
        if(correct){
          playSuccess();
          setTimeout(()=>{
            showBurst(true,null,()=>{
              const from=me.pos, to=Math.min(BOARD_SIZE,me.pos+1);
              showWalkCutscene(me,from,to,()=>{ applyMove(0,1); scheduleNextRound(); });
            });
          },260);
        } else {
          playFail();
          setTimeout(()=>{ showBurst(false,null,()=>{ scheduleNextRound(); }); },260);
        }
      },380);
    });
    openDrawer(false);
    startTimer(mathDeadlineEl,timeLimit,()=>{
      if(humanAnswered||currentRoundId!==myRoundId) return;
      humanAnswered=true; closeDrawer(); setTimeout(()=>scheduleNextRound(),350);
    });
  }

  runBots(myRoundId,timeLimit,onGold);
}

function scheduleBotsOnly(myRoundId){
  const timeLimit=MATH_TIME[difficulty]||20000;
  runBots(myRoundId,timeLimit,false);
  setTimeout(()=>{ if(currentRoundId===myRoundId) scheduleNextRound(); },timeLimit+400);
}

function runBots(myRoundId,timeLimit,onGold){
  botTimeouts.forEach(t=>clearTimeout(t)); botTimeouts=[];
  const cfg=BOT_THINK[difficulty];
  for(let i=1;i<players.length;i++){
    if(players[i].finished||players[i].eliminated) continue;
    const think=Math.round(timeLimit*(cfg.minFrac+Math.random()*(cfg.maxFrac-cfg.minFrac)));
    const correct=Math.random()<cfg.correctChance;
    const t=setTimeout(()=>{
      if(!gameActive||currentRoundId!==myRoundId) return;
      if(correct){ const d=onGold?randInt(1,3):1; applyMove(i,d); }
      updateRaceRow(onGold?goldRaceList:mathRaceList,i,correct);
    },think);
    botTimeouts.push(t);
  }
}

function scheduleNextRound(){ if(gameActive) setTimeout(startRound,NEXT_ROUND_MS); }

/* ── BURST (success / fail / lava) ───────────────── */
function showBurst(iconOrSuccess,customText,onDone){
  let icon, text;
  if(iconOrSuccess===true){ icon="✅"; text="สำเร็จ!"; }
  else if(iconOrSuccess===false){ icon="❌"; text="ผิดพลาด!"; }
  else { icon=iconOrSuccess; text=customText||""; }
  burstIcon.textContent=icon;
  burstText.textContent=text;
  successBurst.classList.add("show");
  setTimeout(()=>{ successBurst.classList.remove("show"); setTimeout(onDone,60); },BURST_MS);
}

/* ── PUZZLE RESULT CARD (gold cell outcome) ──────── */
function showPuzzleResult(correct,ev,steps,onDone){
  prcIcon.textContent=correct?ev.icon:"💀";
  prcTitle.textContent=correct?"บรรลุ!":"บรรลัย!";
  prcSub.textContent=correct?ev.goodLabel(steps):ev.badLabel(steps);
  prcOverlay.classList.add("show");
  setTimeout(()=>{ prcOverlay.classList.remove("show"); setTimeout(onDone,80); },PRC_SHOW_MS);
}

/* ── WALK CUTSCENE ───────────────────────────────── */
function showWalkCutscene(player,fromPos,toPos,onDone){
  const target=Math.min(BOARD_SIZE,Math.max(0,toPos));
  const dir=target>fromPos?1:-1;
  const steps=Math.abs(target-fromPos);
  if(steps===0){ onDone(); return; }

  cutsceneTrack.innerHTML="";
  const cells=[];
  for(let i=0;i<=steps;i++){
    const val=fromPos+dir*i;
    if(val<0||val>BOARD_SIZE) break;
    cells.push(val);
    const wc=document.createElement("div");
    wc.className="wc"+(val===fromPos?" wc-start":val===target?" wc-end":"");
    if(PUZZLE_CELLS.includes(val)) wc.classList.add("wc-gold");
    if(val>0&&val<=lavaLevel)      wc.classList.add("wc-lava");
    const sp=document.createElement("span"); sp.textContent=val; wc.appendChild(sp);
    wc.id=`wc-${val}`;
    cutsceneTrack.appendChild(wc);
  }

  cutsceneAvatar.textContent=player.emoji;
  cutsceneAvatar.style.color=player.color;
  cutsceneCaption.textContent=dir>0
    ? `${player.name} เดินหน้า ${steps} ช่อง...`
    : `${player.name} ถอยหลัง ${steps} ช่อง...`;

  cutsceneAvatar.style.transform="translateX(0px)";
  cutsceneWalk.classList.add("show");

  let step=0;
  function doStep(){
    if(!gameActive){ cutsceneWalk.classList.remove("show"); onDone(); return; }
    if(step>0){ const prev=$(`wc-${cells[step-1]}`); if(prev) prev.classList.remove("wc-active"); }
    const cur=$(`wc-${cells[step]}`);
    if(cur){
      cur.classList.add("wc-active");
      cur.scrollIntoView({ behavior:"smooth", inline:"center", block:"nearest" });
      const trackRect=cutsceneTrack.getBoundingClientRect();
      const curRect=cur.getBoundingClientRect();
      const offsetX=curRect.left-trackRect.left+curRect.width/2-20;
      cutsceneAvatar.style.transform=`translateX(${offsetX}px)`;
    }
    step++;
    if(step<cells.length) setTimeout(doStep,WALK_STEP_MS);
    else setTimeout(()=>{ cutsceneWalk.classList.remove("show"); setTimeout(onDone,80); },380);
  }
  setTimeout(doStep,100);
}

/* ── MOVEMENT ────────────────────────────────────── */
function applyMove(id,delta){
  const p=players[id]; if(p.finished||p.eliminated) return;
  p.pos=Math.min(BOARD_SIZE,Math.max(0,p.pos+delta));
  if(p.pos<=lavaLevel && p.pos>0){ eliminatePlayer(p); return; }
  const justFinished=p.pos>=BOARD_SIZE&&!p.finished;
  if(justFinished){ p.finished=true; p.finishRank=players.filter(x=>x.finished).length; }
  renderTokens(id); renderScoreboard(id);
  if(id===0) zoomToPlayer();
  if(justFinished&&p.finishRank===1) setTimeout(()=>{ stopAll(); showWinScreen(p); },300);
}

/* ── WIN ─────────────────────────────────────────── */
function showWinScreen(winner){
  stopAll();
  winName.textContent=winner?`${winner.emoji} ${winner.name} รอดแล้ว! 🎉`:"เกมจบแล้ว";
  winSub.textContent=winner?"หนีออกจากถ้ำก่อนลาวาจะไหลถึง":"ผลการแข่งขันปัจจุบัน";
  winRankList.innerHTML="";
  const medals=["🥇","🥈","🥉","4️⃣","5️⃣"];
  [...players].sort((a,b)=>b.pos-a.pos).forEach((pl,idx)=>{
    const row=document.createElement("div"); row.className="rank-row";
    const med=document.createElement("div"); med.className="rank-medal"; med.textContent=medals[idx]||"—";
    const nm=document.createElement("div"); nm.className="rank-name"; nm.textContent=`${pl.emoji} ${pl.name}`;
    const ps=document.createElement("div"); ps.className="rank-pos";
    ps.textContent=pl.eliminated?"💀 โดนลาวา":pl.finished?"ช่อง 50 ✓":`ช่อง ${pl.pos}`;
    row.appendChild(med); row.appendChild(nm); row.appendChild(ps);
    winRankList.appendChild(row);
  });
  modalWin.classList.add("show");
}

/* ── MATH HELPERS ────────────────────────────────── */
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function generateQuestion(diff){
  let a,b,c,d,expr,answer;
  if(diff==="easy"){ const op=["+","-"][randInt(0,1)]; a=randInt(1,20);b=randInt(1,20); if(op==="-"&&b>a)[a,b]=[b,a]; answer=op==="+"?a+b:a-b; expr=`${a} ${op} ${b}`; }
  else if(diff==="medium"){ const p=randInt(0,2); if(p===0){a=randInt(2,12);b=randInt(2,12);answer=a*b;expr=`${a} × ${b}`;} else if(p===1){answer=randInt(2,12);b=randInt(2,9);a=answer*b;expr=`${a} ÷ ${b}`;} else{a=randInt(2,12);b=randInt(2,12);c=randInt(1,15);answer=a*b+c;expr=`${a} × ${b} + ${c}`;} }
  else{ const p=randInt(0,2); if(p===0){a=randInt(10,30);b=randInt(2,9);c=randInt(2,9);answer=a-b*c;expr=`${a} - ${b} × ${c}`;} else if(p===1){a=randInt(2,12);b=randInt(2,12);c=randInt(1,20);answer=a*b-c;expr=`${a} × ${b} - ${c}`;} else{b=randInt(2,9);const q=randInt(2,12);a=q*b;c=randInt(2,9);d=randInt(1,10);answer=q+c*d;expr=`${a} ÷ ${b} + ${c} × ${d}`;} }
  return{diff,expr,answer};
}
function makeChoices(correct){ const s=new Set([correct]); let t=0; while(s.size<4&&t<60){t++;const sp=Math.max(3,Math.ceil(Math.abs(correct)*.4));const w=correct+(Math.random()<.5?1:-1)*randInt(1,sp);if(w!==correct)s.add(w);} return shuffle([...s]); }
function shuffle(a){ return a.sort(()=>Math.random()-.5); }
function diffLabel2(d){ return d==="easy"?"ง่าย":d==="medium"?"ปานกลาง":"ยาก"; }

/* ── BOOT ────────────────────────────────────────── */
initGame();

})();
