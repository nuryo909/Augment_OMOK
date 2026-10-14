'use strict';
// Authoritative, UI-independent Omok game rules.
const crypto = require('node:crypto');
const N = 15;
const MILESTONES = [10, 30, 50];
const DIRS = [[1,0],[0,1],[1,1],[1,-1]];
const AUGMENTS = [
  {id:'exchange',name:'등가교환',symbol:'⚖',grade:'희귀',kind:'active',cooldown:4,desc:'내 연속 돌 2개를 희생해 상대 돌 1개 제거',cost:'영구 보유 · 사용 후 내 차례 4턴 쿨타임 · 행동 1턴 소모 · 8방향 인접한 내 돌 2개 필요'},
  {id:'knight',name:'기사의 도약',symbol:'♞',grade:'희귀',kind:'active',cooldown:3,desc:'내 돌 하나를 나이트처럼 이동. 도착 지점의 적 돌 포획 가능',cost:'영구 보유 · 사용 후 내 차례 3턴 쿨타임 · 행동 1턴 소모 · 이동 후 금수 적용'},
  {id:'shift',name:'한 칸 전진',symbol:'↗',grade:'일반',kind:'active',cooldown:2,desc:'내 돌 하나를 주위 8칸 중 비어 있는 칸으로 이동',cost:'영구 보유 · 사용 후 내 차례 2턴 쿨타임 · 행동 1턴 소모 · 이동 후 금수 적용'},
  {id:'spread',name:'공간 도약',symbol:'✦',grade:'희귀',kind:'active',cooldown:4,desc:'한 번에 돌 2개를 한 칸 띄워 일직선으로 배치',cost:'영구 보유 · 사용 후 내 차례 4턴 쿨타임 · 중간 칸은 비어 있어야 함 · 즉시 승리 불가'},
  {id:'collector',name:'잔해 수집',symbol:'◇',grade:'일반',kind:'hybrid',cooldown:2,desc:'내 돌이 제거될 때마다 잔해 +1. 잔해 2개를 소모하여 상대 돌 1개 제거',cost:'영구 보유 · 잔해는 계속 누적 · 스택 사용 후 내 차례 2턴 쿨타임 · 행동 1턴 소모'},
  {id:'freedom',name:'금기의 해방',symbol:'∞',grade:'전설',kind:'passive',only:1,desc:'게임 종료까지 흑의 33 금수 제한 해제',cost:'상시 적용 · 44 금수·장목은 유지 · 재사용 제한 없음'},
  {id:'atari',name:'포위의 한 수',symbol:'⊕',grade:'일반',kind:'active',cooldown:2,desc:'상하좌우가 내 돌로 포위된 고립된 상대 돌 1개 제거',cost:'영구 보유 · 사용 후 내 차례 2턴 쿨타임 · 행동 1턴 소모 · 상대 돌의 네 방향 모두 내 돌이어야 함'}
];
const BY_ID = Object.fromEntries(AUGMENTS.map(a=>[a.id,a]));
class RuleError extends Error { constructor(message) { super(message); this.name = 'RuleError'; } }
const fail = message => { throw new RuleError(message); };
const inside = (r,c) => Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<N&&c>=0&&c<N;
const validPoint = v => Array.isArray(v)&&v.length===2&&inside(v[0],v[1]);
function point(v) { if(!validPoint(v))fail('유효한 오목판 좌표가 아닙니다.'); return v; }
const eq = (a,b) => a[0]===b[0]&&a[1]===b[1];
const isAdjacent = (a,b) => Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))===1;
const knightStep = (a,b) => { const x=Math.abs(a[0]-b[0]), y=Math.abs(a[1]-b[1]);return (x===1&&y===2)||(x===2&&y===1); };
const newBoard = () => Array.from({length:N},()=>Array(N).fill(0));
const run = (b,r,c,dr,dc,color) => {let n=1;for(const sign of [-1,1]){let y=r+dr*sign,x=c+dc*sign;while(inside(y,x)&&b[y][x]===color){n++;y+=dr*sign;x+=dc*sign}}return n;};
const exactFive = (b,r,c) => DIRS.some(([dr,dc])=>run(b,r,c,dr,dc,1)===5);
const hasOverline = (b,r,c) => DIRS.some(([dr,dc])=>run(b,r,c,dr,dc,1)>5);
const isVictory = (b,p,r,c) => p===1?exactFive(b,r,c):DIRS.some(([dr,dc])=>run(b,r,c,dr,dc,2)>=5);
function fours(b,r,c){
 const keys=new Set();
 for(const [dr,dc] of DIRS)for(let start=-4;start<=0;start++){
  let stones=[],empty=null,valid=true;
  for(let i=0;i<5;i++){const y=r+(start+i)*dr,x=c+(start+i)*dc;if(!inside(y,x)||b[y][x]===2){valid=false;break}if(b[y][x]===1)stones.push([y,x]);else empty=[y,x]}
  if(!valid||stones.length!==4||!stones.some(([y,x])=>y===r&&x===c)||!empty)continue;
  const [ey,ex]=empty;b[ey][ex]=1;const wins=run(b,ey,ex,dr,dc,1)===5;b[ey][ex]=0;
  if(wins)keys.add(stones.map(([y,x])=>y+','+x).sort().join('|'));
 }
 return keys.size;
}
function openThreeDirections(b,r,c){
 let count=0;
 for(const [dr,dc] of DIRS){let found=false;
  for(let k=-4;k<=4&&!found;k++){
   if(k===0)continue;const y=r+k*dr,x=c+k*dc;
   if(!inside(y,x)||b[y][x]!==0)continue;b[y][x]=1;
   if(!hasOverline(b,y,x)&&fours(b,y,x)<2){
    for(let start=-3;start<=0&&!found;start++){
     let four=[],ok=true;
     for(let i=0;i<4;i++){const yy=y+(start+i)*dr,xx=x+(start+i)*dc;if(!inside(yy,xx)||b[yy][xx]!==1){ok=false;break}four.push([yy,xx])}
     if(!ok||!four.some(([yy,xx])=>yy===r&&xx===c))continue;
     const ly=y+(start-1)*dr,lx=x+(start-1)*dc,ry=y+(start+4)*dr,rx=x+(start+4)*dc;
     if(!inside(ly,lx)||!inside(ry,rx)||b[ly][lx]!==0||b[ry][rx]!==0)continue;
     b[ly][lx]=1;const left=run(b,ly,lx,dr,dc,1)===5;b[ly][lx]=0;
     b[ry][rx]=1;const right=run(b,ry,rx,dr,dc,1)===5;b[ry][rx]=0;
     if(left&&right)found=true;
    }
   }
   b[y][x]=0;
  }
  if(found)count++;
 }
 return count;
}
function blackResult(b,r,c){
 if(hasOverline(b,r,c))return {illegal:'장목 금수: 흑은 6개 이상을 이을 수 없습니다.',kind:'overline'};
 if(exactFive(b,r,c))return {win:true};
 if(fours(b,r,c)>=2)return {illegal:'44 금수: 동시에 두 개 이상의 사목을 만들 수 없습니다.',kind:'44'};
 if(openThreeDirections(b,r,c)>=2)return {illegal:'33 금수: 동시에 두 개 이상의 열린 삼을 만들 수 없습니다.',kind:'33'};
 return {win:false};
}
function freshState(){return {board:newBoard(),turn:1,moves:[],winner:0,owned:{1:[],2:[]},cooldowns:{1:{},2:{}},stacks:{1:0,2:0},lastCells:[],draft:null,message:'흑이 먼저 시작합니다. 교차점을 눌러 돌을 놓으세요.'};}
function newGame() {return {state:freshState(), undoStack:[]};}
function snapshot(s) {return JSON.parse(JSON.stringify(s));}
function hasAug(s,p,id) {return s.owned[p].includes(id);}
function canUse(s,p,id) {return hasAug(s,p,id)&&BY_ID[id]?.cooldown&&!(s.cooldowns[p][id]>0)&&(id!=='collector'||s.stacks[p]>=2);}
function validateBlack(s,r,c){const v=blackResult(s.board,r,c);return v.illegal&&!(v.kind==='33'&&hasAug(s,1,'freedom'))?v.illegal:null;}
function grantRemoval(s,r,c){const who=s.board[r][c];if(!who)return;s.board[r][c]=0;if(hasAug(s,who,'collector'))s.stacks[who]++;}
function sampleOffers(s,p){const pool=AUGMENTS.filter(a=>(!a.only||a.only===p)&&!hasAug(s,p,a.id)).map(a=>a.id);
 for(let i=pool.length-1;i>0;i--){const j=crypto.randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,3);
}
function endAction(s,label,coords,abilityId=null){
 const p=s.turn;
 for(const id of Object.keys(s.cooldowns[p])) if(id!==abilityId&&s.cooldowns[p][id]>0)s.cooldowns[p][id]--;
 s.moves.push({p,type:label,coords:coords.map(a=>a.slice())}); s.lastCells=coords.map(a=>a.slice());
 if(s.winner===0&&s.board.every(row=>row.every(v=>v!==0)))s.winner=3;
 if(s.winner){s.message=s.winner===3?'무승부! 모든 칸이 찼습니다.':(s.winner===1?'흑':'백')+' 승리! '+s.moves.length+'수 만에 5목을 완성했습니다.';return;}
 s.turn=3-p;
 if(MILESTONES.includes(s.moves.length)){
  s.draft={at:s.moves.length,player:1,offers:sampleOffers(s,1)};
  s.message=s.moves.length+'수 도달! 흑과 백이 각각 증강을 선택합니다.';
 } else s.message=(s.turn===1?'흑':'백')+' 차례입니다.';
}
function validateActive(s,p,id){
 if(!BY_ID[id]||!canUse(s,p,id))fail('해당 증강이 없거나 아직 사용 준비가 되지 않았습니다.');
}
function abilityAction(s,p,a){
 const id=a.id;validateActive(s,p,id);const opp=3-p;let coords=[],placed=[]; const b=s.board;
 if(id==='exchange'){
  const en=point(a.enemy), arr=a.sacrifices;
  if(!Array.isArray(arr)||arr.length!==2)fail('희생할 돌 2개가 필요합니다.');
  const one=point(arr[0]),two=point(arr[1]);
  if(b[en[0]][en[1]]!==opp)fail('상대 돌을 선택하세요.');
  if(b[one[0]][one[1]]!==p||b[two[0]][two[1]]!==p||eq(one,two)||!isAdjacent(one,two))fail('서로 인접한 내 돌 2개를 희생해야 합니다.');
  for(const q of [en,one,two])grantRemoval(s,...q);
  coords=[en,one,two];
 }else if(id==='collector'){
  const en=point(a.target);if(b[en[0]][en[1]]!==opp)fail('제거할 상대 돌을 선택하세요.');
  if(s.stacks[p]<2)fail('잔해 스택 2개가 필요합니다.');
  s.stacks[p]-=2;grantRemoval(s,...en);coords=[en];
 }else if(id==='atari'){
  const en=point(a.target),[r,c]=en;
  if(b[r][c]!==opp)fail('제거할 상대 돌을 선택하세요.');
  if(![[1,0],[-1,0],[0,1],[0,-1]].every(([dr,dc])=>inside(r+dr,c+dc)&&b[r+dr][c+dc]===p))fail('상대 돌 상하좌우 모두 내 돌로 둘러싸여야 합니다.');
  grantRemoval(s,r,c);coords=[en];
 }else if(id==='knight'||id==='shift'){
  const src=point(a.source),dst=point(a.target),[r,c]=dst;
  if(b[src[0]][src[1]]!==p)fail('출발 칸에 내 돌이 없습니다.');
  if(id==='knight'&&!knightStep(src,dst))fail('나이트는 1×2 또는 2×1칸 이동해야 합니다.');
  if(id==='shift'&&!isAdjacent(src,dst))fail('8방향으로 인접한 한 칸만 이동할 수 있습니다.');
  if(b[r][c]===p)fail('내 돌이 있는 칸으로 이동할 수 없습니다.');
  if(id==='shift'&&b[r][c]!==0)fail('한 칸 전진은 빈칸으로만 이동합니다.');
  b[src[0]][src[1]]=0;
  if(b[r][c]===opp)grantRemoval(s,r,c);
  b[r][c]=p;
  if(p===1){const invalid=validateBlack(s,r,c);if(invalid)fail(invalid);}
  coords=[src,dst];placed=[dst];
 }else if(id==='spread'){
  const first=point(a.first),second=point(a.second),[r,c]=second;
  const dr=r-first[0],dc=c-first[1];
  if(!((Math.abs(dr)===2&&dc===0)||(dr===0&&Math.abs(dc)===2)||(Math.abs(dr)===2&&Math.abs(dc)===2)))fail('두 돌은 한 칸 띄워 일직선으로 놓아야 합니다.');
  if(b[first[0]][first[1]]!==0||b[r][c]!==0||b[first[0]+dr/2][first[1]+dc/2]!==0)fail('세 칸 모두 비어 있어야 합니다.');
  b[first[0]][first[1]]=p;
  if(p===1){const invalid=validateBlack(s,...first);if(invalid)fail(invalid);}
  if(isVictory(b,p,...first))fail('공간 도약으로 즉시 승리할 수 없습니다.');
  b[r][c]=p;
  if(p===1){for(const q of [first,second]){const invalid=validateBlack(s,...q);if(invalid)fail(invalid);}}
  if(isVictory(b,p,...first)||isVictory(b,p,r,c))fail('공간 도약으로 즉시 승리할 수 없습니다.');
  coords=[first,second];placed=[first,second];
 }else fail('존재하지 않는 능력입니다.');
 s.cooldowns[p][id]=BY_ID[id].cooldown;
 for(const [r,c] of placed)if(isVictory(b,p,r,c)){s.winner=p;break;}
 endAction(s,BY_ID[id].name,coords,id);
}
function apply(game,player,action){
 if(![1,2].includes(player))fail('플레이어 정보가 올바르지 않습니다.');
 if(!action||typeof action!=='object'||Array.isArray(action))fail('잘못된 요청입니다.');
 const before=snapshot(game.state),s=game.state;
 try{
  if(action.type==='draft'){
   if(!s.draft||s.draft.player!==player)fail('현재 증강을 선택할 차례가 아닙니다.');
   if(typeof action.id!=='string'||!s.draft.offers.includes(action.id))fail('제시된 증강 중에서 선택하세요.');
   s.owned[player].push(action.id);
   if(BY_ID[action.id].cooldown)s.cooldowns[player][action.id]=0;
   if(player===1){s.draft={at:s.draft.at,player:2,offers:sampleOffers(s,2)};s.message='흑이 증강을 선택했습니다. 백의 선택을 기다립니다.';}
   else{s.draft=null;s.message='증강 선택 완료! '+(s.turn===1?'흑':'백')+' 차례입니다.';}
   return;
  }
  if(s.winner)fail('대국이 종료되었습니다.');
  if(s.draft)fail('증강 선택이 끝나야 진행할 수 있습니다.');
  if(s.turn!==player)fail('상대의 차례입니다.');
  if(action.type==='place'){
   const [r,c]=point(action.at);
   if(s.board[r][c])fail('이미 돌이 있는 칸입니다.');
   s.board[r][c]=player;
   if(player===1){const invalid=validateBlack(s,r,c);if(invalid)fail(invalid);}
   if(isVictory(s.board,player,r,c))s.winner=player;
   endAction(s,'일반 착수',[[r,c]]);
  } else if(action.type==='ability'){
   if(typeof action.id!=='string')fail('능력을 선택하세요.');
   abilityAction(s,player,action);
  } else fail('지원하지 않는 게임 동작입니다.');
  game.undoStack.push(before);
  if(game.undoStack.length>225)game.undoStack.shift();
 } catch(e){game.state=before;throw e;}
}
function undo(game){if(!game.undoStack.length)fail('되돌릴 수가 없습니다.');game.state=game.undoStack.pop();game.state.message='직전 수를 되돌렸습니다. '+(game.state.turn===1?'흑':'백')+' 차례입니다.';}
function publicState(game,me,online,pending){
 const s=game.state;
 return {me,board:s.board,turn:s.turn,moves:s.moves,winner:s.winner,owned:s.owned,cooldowns:s.cooldowns,stacks:s.stacks,lastCells:s.lastCells,
   draft:s.draft?{at:s.draft.at,player:s.draft.player,offers:s.draft.player===me?s.draft.offers:[]}:null,
   message:s.message,online,pending,canUndo:game.undoStack.length>0,milestones:MILESTONES};
}
module.exports={N,MILESTONES,AUGMENTS,newGame,apply,undo,publicState,RuleError,blackResult,canUse,inside};
