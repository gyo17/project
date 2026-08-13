/* home.js — index.html */
(function(){
"use strict";

const NUM_PLAYERS   = 5;
const PLAYER_COLORS = ["#FF5722","#00E5FF","#FFD600","#8BC34A","#E040FB"];
const PLAYER_EMOJIS = ["🧑","🧒","👩","🧔","👧"];

/* ── Cave atmosphere ── */
function buildAtmosphere(){
  const stal = document.getElementById("stalactites");
  if(stal){
    for(let i=0;i<28;i++){
      const s = document.createElement("div");
      s.className="stalactite";
      const w = 12+Math.random()*22;
      const h = 30+Math.random()*120;
      s.style.cssText=`border-left-width:${w/2}px;border-right-width:${w/2}px;border-top-width:${h}px;border-top-color:hsl(${260+Math.random()*20},${30+Math.random()*15}%,${10+Math.random()*10}%);animation-delay:${Math.random()*3}s;animation-duration:${2.5+Math.random()*2}s;flex:0 0 auto;`;
      stal.appendChild(s);
    }
  }
  const em = document.getElementById("embers");
  if(em){
    for(let i=0;i<20;i++){
      const e=document.createElement("div");
      e.className="ember";
      e.style.cssText=`left:${Math.random()*100}%;--drift:${(Math.random()-.5)*60}px;animation-duration:${4+Math.random()*5}s;animation-delay:${Math.random()*6}s;`;
      em.appendChild(e);
    }
  }
}

/* ── Player inputs ── */
function buildPlayerInputs(){
  const wrap = document.getElementById("player-inputs");
  if(!wrap) return;
  for(let i=0;i<NUM_PLAYERS;i++){
    const row=document.createElement("div"); row.className="player-input-row";
    const tok=document.createElement("div"); tok.className="player-token";
    tok.style.background=PLAYER_COLORS[i]+"33";
    tok.style.border=`2px solid ${PLAYER_COLORS[i]}`;
    tok.textContent=PLAYER_EMOJIS[i];
    const inp=document.createElement("input"); inp.type="text"; inp.maxLength=14;
    inp.placeholder=i===0?"นักผจญภัยที่ 1 (คุณ)":`บอทที่ ${i}`;
    inp.id=`pname-${i}`;
    row.appendChild(tok); row.appendChild(inp);
    wrap.appendChild(row);
  }
}

/* ── Mode tabs ── */
let selectedDiff="medium";
let onlineDiff="medium";
document.querySelectorAll(".mode-tab").forEach(tab=>{
  tab.addEventListener("click",()=>{
    document.querySelectorAll(".mode-tab").forEach(t=>t.classList.remove("active"));
    document.querySelectorAll(".mode-panel").forEach(p=>p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.mode}`)?.classList.add("active");
  });
});
document.querySelectorAll('input[name="difficulty"]').forEach(r=>{
  r.addEventListener("change",e=>{ selectedDiff=e.target.value; });
});
document.querySelectorAll('input[name="online-difficulty"]').forEach(r=>{
  r.addEventListener("change",e=>{ onlineDiff=e.target.value; });
});

/* ── Start local ── */
document.getElementById("btn-start-local")?.addEventListener("click",()=>{
  const players=[];
  for(let i=0;i<NUM_PLAYERS;i++){
    const inp=document.getElementById(`pname-${i}`);
    const name=(inp?.value||"").trim()||(i===0?"คุณ":`บอท ${i}`);
    players.push({id:i,name,color:PLAYER_COLORS[i],emoji:PLAYER_EMOJIS[i]});
  }
  sessionStorage.setItem("game_players",JSON.stringify(players));
  sessionStorage.setItem("game_difficulty",selectedDiff);
  sessionStorage.setItem("game_mode","local");
  window.location.href="game.html";
});

/* ── Online: Create Room ── */
document.getElementById("btn-create-room")?.addEventListener("click",async()=>{
  const name=(document.getElementById("online-name-create")?.value||"").trim();
  if(!name){ setStatus("กรุณาใส่ชื่อของคุณก่อน","err"); return; }
  if(!checkFirebase()){ setStatus("ยังไม่ได้ตั้งค่า Firebase — คลิก '⚙️ วิธีตั้งค่า' ด้านบน","err"); return; }
  const code=Math.floor(1000+Math.random()*9000).toString();
  const me={id:0,name,color:PLAYER_COLORS[0],emoji:PLAYER_EMOJIS[0]};
  sessionStorage.setItem("game_mode","online");
  sessionStorage.setItem("game_difficulty",onlineDiff);
  sessionStorage.setItem("online_room",code);
  sessionStorage.setItem("online_me",JSON.stringify(me));
  sessionStorage.setItem("online_isHost","1");
  window.location.href="game.html";
});

/* ── Online: Join Room ── */
document.getElementById("btn-join-room")?.addEventListener("click",()=>{
  const code=(document.getElementById("room-code-input")?.value||"").trim();
  const name=(document.getElementById("online-name-join")?.value||"").trim();
  if(code.length!==4||isNaN(code)){ setStatus("รหัสห้องต้องเป็นตัวเลข 4 หลัก","err"); return; }
  if(!name){ setStatus("กรุณาใส่ชื่อของคุณก่อน","err"); return; }
  if(!checkFirebase()){ setStatus("ยังไม่ได้ตั้งค่า Firebase","err"); return; }
  const slotColors=PLAYER_COLORS; const slotEmojis=PLAYER_EMOJIS;
  const me={name,color:slotColors[1],emoji:slotEmojis[1]};
  sessionStorage.setItem("game_mode","online");
  sessionStorage.setItem("online_room",code);
  sessionStorage.setItem("online_me",JSON.stringify(me));
  sessionStorage.setItem("online_isHost","0");
  window.location.href="game.html";
});

function checkFirebase(){
  return typeof FIREBASE_CONFIG!=="undefined" && FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("YOUR");
}
function setStatus(msg,cls){
  const el=document.getElementById("online-status");
  if(!el) return;
  el.textContent=msg; el.className="online-status "+cls;
}

/* room code: digits only */
document.getElementById("room-code-input")?.addEventListener("input",function(){
  this.value=this.value.replace(/\D/g,"").slice(0,4);
});

buildAtmosphere();
buildPlayerInputs();
})();