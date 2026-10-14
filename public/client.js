(()=>{
'use strict';
const $=id=>document.getElementById(id);
const N=15,colNames='ABCDEFGHIJKLMNO';
const AUGMENTS=[
 {id:'exchange',name:'등가교환',symbol:'⚖',grade:'희귀',kind:'active',cooldown:4,desc:'내 연속 돌 2개를 희생해 상대 돌 1개 제거',cost:'영구 보유 · 사용 후 내 차례 4턴 쿨타임 · 행동 1턴 소모 · 8방향 인접한 내 돌 2개 필요'},
 {id:'knight',name:'기사의 도약',symbol:'♞',grade:'희귀',kind:'active',cooldown:3,desc:'내 돌 하나를 나이트처럼 이동. 도착 지점의 적 돌 포획 가능',cost:'영구 보유 · 사용 후 내 차례 3턴 쿨타임 · 행동 1턴 소모 · 이동 후 금수 적용'},
 {id:'shift',name:'한 칸 전진',symbol:'↗',grade:'일반',kind:'active',cooldown:2,desc:'내 돌 하나를 주위 8칸 중 비어 있는 칸으로 이동',cost:'영구 보유 · 사용 후 내 차례 2턴 쿨타임 · 행동 1턴 소모 · 이동 후 금수 적용'},
 {id:'spread',name:'공간 도약',symbol:'✦',grade:'희귀',kind:'active',cooldown:4,desc:'한 번에 돌 2개를 한 칸 띄워 일직선으로 배치',cost:'영구 보유 · 사용 후 내 차례 4턴 쿨타임 · 중간 칸은 비어 있어야 함 · 즉시 승리 불가'},
 {id:'collector',name:'잔해 수집',symbol:'◇',grade:'일반',kind:'hybrid',cooldown:2,desc:'내 돌이 제거될 때마다 잔해 +1. 잔해 2개를 소모하여 상대 돌 1개 제거',cost:'영구 보유 · 잔해는 계속 누적 · 스택 사용 후 내 차례 2턴 쿨타임 · 행동 1턴 소모'},
 {id:'freedom',name:'금기의 해방',symbol:'∞',grade:'전설',kind:'passive',only:1,desc:'게임 종료까지 흑의 33 금수 제한 해제',cost:'상시 적용 · 44 금수·장목은 유지 · 재사용 제한 없음'},
 {id:'atari',name:'포위의 한 수',symbol:'⊕',grade:'일반',kind:'active',cooldown:2,desc:'상하좌우가 내 돌로 포위된 고립된 상대 돌 1개 제거',cost:'영구 보유 · 사용 후 내 차례 2턴 쿨타임 · 행동 1턴 소모 · 상대 돌의 네 방향 모두 내 돌이어야 함'}
];
const byId=Object.fromEntries(AUGMENTS.map(a=>[a.id,a]));
const boardEl=$('intersections');
let s=null, code='',token='',player=0,stream=null,active=null,processing=false,notice='',onlineConnected=false;
const inside=(r,c)=>r>=0&&r<N&&c>=0&&c<N;
const playerName=p=>p===1?'흑':'백';
const coord=(r,c)=>colNames[c]+(N-r);
const isAdjacent=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))===1;
const knightStep=(a,b)=>{const x=Math.abs(a[0]-b[0]),y=Math.abs(a[1]-b[1]);return(x===1&&y===2)||(x===2&&y===1)};
const encode=code=>code.replace(/[^A-Z2-9]/g,'');
function logError(err){notice=err.message||'오류가 발생했습니다.';render();}
async function api(path,payload,method='POST'){
 const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(payload||{}):undefined,cache:'no-store'});
 let json={};try{json=await response.json()}catch{}
 if(!response.ok)throw Error(json.error||'서버 요청에 실패했습니다.');return json;
}
function storedToken(room){try{return localStorage.getItem('augOmok_'+room)||''}catch{return ''}}
function storeToken(room,value){try{localStorage.setItem('augOmok_'+room,value)}catch{}}
function setLobbyError(message){$('lobbyFeedback').textContent=message;}
function showLobby(){if(stream){stream.close();stream=null;}code='';token='';player=0;s=null;active=null;onlineConnected=false;
 $('lobbyOverlay').hidden=false;$('waitOverlay').hidden=true;$('draftOverlay').hidden=true;$('requestOverlay').hidden=true;history.replaceState({},'',location.pathname);}
async function createRoom(){try{$('createRoom').disabled=true;setLobbyError('');const result=await api('/api/rooms');enterRoom(result)}catch(e){setLobbyError(e.message)}finally{$('createRoom').disabled=false}}
async function joinRoom(joinCode){const room=encode(joinCode.trim().toUpperCase());if(room.length!==6){setLobbyError('방 코드 6자리를 입력해주세요.');return;}
 try{setLobbyError('');$('joinCode').value=room;const result=await api('/api/rooms/'+room+'/join',{token:storedToken(room)});enterRoom(result)}catch(e){setLobbyError(e.message)}
}
function enterRoom(info){code=info.code;token=info.token;player=info.player;storeToken(code,token);active=null;s=null;notice='';
 history.replaceState({},'',location.pathname+'?room='+code);$('roomCode').textContent=code;$('waitCode').textContent=code;$('myRole').textContent='내 색상: '+playerName(player)+' · 서버에서 착수와 증강을 검증합니다.';
 $('lobbyOverlay').hidden=true;connect();render();}
function connect(){if(stream){stream.close();stream=null;}onlineConnected=false;
 stream=new EventSource('/api/rooms/'+code+'/events?token='+encodeURIComponent(token));
 stream.onopen=()=>{onlineConnected=true;notice='';render()};
 stream.onmessage=e=>{try{const incoming=JSON.parse(e.data);if(!s||incoming.moves.length!==s.moves.length||incoming.turn!==s.turn||incoming.draft?.player!==s.draft?.player||incoming.winner!==s.winner||JSON.stringify(incoming.board)!==JSON.stringify(s.board))active=null;s=incoming;notice='';render()}catch(err){console.error('state decode:',err)}};
 stream.onerror=()=>{onlineConnected=false;render()};
}
async function dispatch(action){if(!s||processing)return;processing=true;notice='';render();
 try{await api('/api/rooms/'+code+'/action',{token,action});active=null;}catch(e){notice=e.message;}finally{processing=false;render();}
}
function inviteLink(){return location.origin+location.pathname+'?room='+code}
async function copyInvite(){try{await navigator.clipboard.writeText(inviteLink());notice='초대 링크를 복사했습니다.';}catch{try{await navigator.clipboard.writeText(code);notice='방 코드를 복사했습니다.'}catch{notice='방 코드: '+code+' / 주소: '+inviteLink();}}render();}
function currentGuidance(){if(!active)return '';
 const {id,phase}=active;
 if(id==='exchange')return phase==='enemy'?'제거할 상대 돌을 선택하세요.':phase==='own1'?'희생할 내 돌 1개를 선택하세요.':'첫 번째 희생 돌과 인접한 내 돌 1개를 더 선택하세요.';
 if(id==='collector')return '잔해 2개를 소모해 제거할 상대 돌을 선택하세요.';
 if(id==='atari')return '상하좌우 모두 내 돌로 둘러싸인 상대 돌을 선택하세요.';
 if(id==='knight'||id==='shift')return phase==='source'?'움직일 내 돌을 먼저 선택하세요.':'이동할 칸을 선택하세요.';
 if(id==='spread')return phase==='first'?'첫 번째 빈칸을 선택하세요.':'한 칸 띄운 두 번째 빈칸을 선택하세요.';
 return '';
}
function usable(id){return !!s&&s.owned[player].includes(id)&&!!byId[id]?.cooldown&&!(s.cooldowns[player][id]>0)&&(id!=='collector'||s.stacks[player]>=2)}
function startAbility(id){if(!canAct()||!usable(id))return;if(active&&active.id===id){active=null;render();return;}
 active={id,phase:id==='exchange'?'enemy':id==='knight'||id==='shift'?'source':id==='spread'?'first':'enemy'};render();}
function markAvailable(r,c){boardEl.children[r*N+c]?.classList.add('target')}
function canAct(){return !!s&&s.ready&&!s.winner&&!s.draft&&!s.pending&&s.turn===player&&onlineConnected&&!processing}
function onCell(r,c){if(!canAct())return;
 if(!active){if(s.board[r][c])return logError(Error('이미 돌이 있는 칸입니다.'));return dispatch({type:'place',at:[r,c]});}
 const id=active.id,phase=active.phase,v=s.board[r][c];
 if(id==='exchange'){
  if(phase==='enemy'){if(v!==3-player)return logError(Error('제거할 상대 돌을 선택하세요.'));active={id,phase:'own1',enemy:[r,c]};render();return;}
  if(phase==='own1'){if(v!==player)return logError(Error('희생할 첫 번째 내 돌을 선택하세요.'));active={...active,phase:'own2',own1:[r,c]};render();return;}
  if(v!==player||!isAdjacent(active.own1,[r,c]))return logError(Error('첫 번째 돌과 인접한 내 돌을 선택하세요.'));
  return dispatch({type:'ability',id,enemy:active.enemy,sacrifices:[active.own1,[r,c]]});
 }
 if(id==='collector'||id==='atari'){if(v!==3-player)return logError(Error('제거할 상대 돌을 선택하세요.'));return dispatch({type:'ability',id,target:[r,c]});}
 if(id==='knight'||id==='shift'){
  if(phase==='source'){if(v!==player)return logError(Error('이동할 내 돌을 먼저 선택하세요.'));active={id,phase:'target',source:[r,c]};render();return;}
  const src=active.source,dst=[r,c];
  if(id==='knight'&&!knightStep(src,dst))return logError(Error('나이트는 1×2 또는 2×1칸 이동합니다.'));
  if(id==='shift'&&!isAdjacent(src,dst))return logError(Error('8방향으로 인접한 한 칸만 이동할 수 있습니다.'));
  return dispatch({type:'ability',id,source:src,target:dst});
 }
 if(id==='spread'){
  if(v!==0)return logError(Error('빈칸을 선택하세요.'));
  if(phase==='first'){active={id,phase:'second',first:[r,c]};render();return;}
  const first=active.first,dr=r-first[0],dc=c-first[1];
  if(!((Math.abs(dr)===2&&dc===0)||(dr===0&&Math.abs(dc)===2)||(Math.abs(dr)===2&&Math.abs(dc)===2)))return logError(Error('두 돌은 한 칸 띄워 일직선으로 놓아야 합니다.'));
  return dispatch({type:'ability',id,first,second:[r,c]});
 }
}
function render(){
 if(!s){$('waitOverlay').hidden=true;return;}
 const b=s.board,turn=s.turn,moves=s.moves,winner=s.winner,draft=s.draft;
 $('roomCode').textContent=code;
 $('moveCount').textContent=moves.length+'수 진행';
 $('blackCount').textContent=moves.filter(m=>m.p===1).length+'턴 진행';$('whiteCount').textContent=moves.filter(m=>m.p===2).length+'턴 진행';
 $('board').classList.toggle('black-turn',turn===1);$('board').classList.toggle('white-turn',turn===2);
 $('board').classList.toggle('locked',!canAct());
 for(let r=0;r<N;r++)for(let c=0;c<N;c++){
  const el=boardEl.children[r*N+c],v=b[r][c],last=s.lastCells.some(([y,x])=>y===r&&x===c);
  el.classList.toggle('empty',v===0);el.classList.remove('bad-hover','target','selected','last-moved');
  el.innerHTML=(v?'<span class="stone '+(v===1?'black':'white')+(last?' last':'')+'"></span>':'<span class="ghost"></span>')+([3,7,11].includes(r)&&[3,7,11].includes(c)&&((r===7&&c===7)||(r!==7&&c!==7))?'<span class="hoshi"></span>':'');
  el.title=coord(r,c)+(v?' · '+playerName(v)+'돌':'');el.disabled=!canAct();
 }
 if(active){const coords=[];for(const key of ['enemy','own1','source','first'])if(active[key])coords.push(active[key]);for(const [r,c] of coords)boardEl.children[r*N+c].classList.add('selected');
  if(active.phase==='target'&&active.source)for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(active.id==='knight'?knightStep(active.source,[r,c]):isAdjacent(active.source,[r,c])){if(b[r][c]!==player&&(active.id==='knight'||b[r][c]===0))markAvailable(r,c)}
  if(active.phase==='second'){const[y,x]=active.first;for(const [dy,dx] of [[2,0],[-2,0],[0,2],[0,-2],[2,2],[2,-2],[-2,2],[-2,-2]]){const r=y+dy,c=x+dx;if(inside(r,c)&&!b[r][c]&&!b[y+dy/2][x+dx/2])markAvailable(r,c)}}
 }
 for(const p of [1,2]){
  $('player'+(p===1?'Black':'White')).classList.toggle('active',!winner&&(draft?draft.player===p:turn===p));
  $(p===1?'blackState':'whiteState').textContent=winner===p?'승리':winner?'종료':draft&&draft.player===p?'증강 선택':turn===p?'진행 중':'대기';
  const el=$(p===1?'augmentsBlack':'augmentsWhite');
  el.innerHTML=s.owned[p].length?s.owned[p].map(id=>{const a=byId[id],cd=s.cooldowns[p][id]||0,detail=id==='freedom'?'상시 발동':(id==='collector'?'잔해 '+s.stacks[p]+'개 · ':'')+(cd?'쿨 '+cd+'턴':'준비 완료');return '<div class="owned-item" title="'+a.desc+'"><span class="owned-icon">'+a.symbol+'</span><span class="owned-name">'+a.name+'</span><span class="owned-detail">'+detail+'</span></div>'}).join(''):'<span class="no-aug">아직 선택한 증강이 없습니다.</span>';
 }
 document.querySelectorAll('.milestone span').forEach((el,i)=>el.classList.toggle('done',moves.length>=[10,30,50][i]));
 $('undo').disabled=!s.ready||!s.canUndo||!!draft||!!s.pending;$('reset').disabled=!s.ready||!!s.pending;
 let status=notice||(active?('['+byId[active.id].name+'] '+currentGuidance()):s.message);
 if(!s.ready)status='친구가 입장하면 대국이 시작됩니다.';
 else if(!onlineConnected)status='서버와 연결이 끊어졌습니다. 자동 재연결 중입니다.';
 else if(s.pending)status='무르기 또는 새 대국 요청에 대한 응답을 기다립니다.';
 else if(s.turn!==player&&!s.winner&&!s.draft)status='상대의 차례입니다. 대국 상태가 자동으로 업데이트됩니다.';
 $('statusbar').classList.toggle('error',!!notice||!onlineConnected);$('status').textContent=status;
 $('history').innerHTML=moves.length?moves.slice(-8).reverse().map((m,i)=>'<div class="item"><span class="tiny-stone '+(m.p===2?'w':'')+'"></span><span>'+(moves.length-i)+'. '+(m.type==='일반 착수'?coord(...m.coords[0]):m.type)+'</span></div>').join(''):'<span class="empty-history">아직 놓인 돌이 없습니다.</span>';
 $('connectionStatus').textContent=(onlineConnected?'● 서버 연결됨':'● 연결 확인 중')+' · 흑 '+(s.online[1]?'접속':'오프라인')+' / 백 '+(s.online[2]?'접속':'오프라인');
 $('myRole').textContent='내 색상: '+playerName(player)+' · '+(s.ready?'상대가 입장했습니다.':'상대 입장 대기 중');
 document.querySelector('.tag').classList.toggle('connected',onlineConnected);
 const area=$('abilityArea');area.innerHTML='';
 if(!s.ready)area.innerHTML='<div class="ability-empty">상대 입장을 기다리고 있습니다.</div>';
 else if(draft)area.innerHTML='<div class="ability-empty">증강 선택 중입니다.</div>';
 else if(winner)area.innerHTML='<div class="ability-empty">대국이 종료되었습니다.</div>';
 else if(turn!==player)area.innerHTML='<div class="ability-empty">상대 턴입니다. 보유한 증강과 쿨타임은 위에서 볼 수 있어요.</div>';
 else{
  const ab=s.owned[player].filter(id=>byId[id].cooldown);
  if(!ab.length)area.innerHTML='<div class="ability-empty">사용할 액티브 증강이 없습니다. 오목판에서 돌을 놓으세요.</div>';
  for(const id of ab){const a=byId[id],el=document.createElement('button');el.className='ability-btn'+(active?.id===id?' activated':'');el.type='button';el.disabled=!usable(id)||!canAct();el.title=a.desc+' / '+a.cost;
   el.innerHTML='<span>'+a.symbol+' &nbsp;'+a.name+'</span><small>'+(s.cooldowns[player][id]?'쿨 '+s.cooldowns[player][id]+'턴':id==='collector'&&!usable(id)?'잔해 부족':active?.id===id?'취소':'사용')+'</small>';el.onclick=()=>startAbility(id);area.appendChild(el);}
  if(active){const cancel=document.createElement('button');cancel.type='button';cancel.className='cancel-ability';cancel.textContent='✕ 증강 사용 취소';cancel.onclick=()=>{active=null;notice='';render()};area.appendChild(cancel);}
 }
 $('waitOverlay').hidden=!!s.ready; $('draftOverlay').hidden=!draft||!s.ready;
 if(draft&&s.ready){$('draftTitle').textContent=draft.at+'수 증강 선택';$('draftStep').textContent=playerName(draft.player)+' 플레이어 · 증강 '+([10,30,50].indexOf(draft.at)+1)+'/3';$('draftCards').innerHTML='';
  if(draft.player!==player){$('draftCards').innerHTML='<div class="draft-wait" style="grid-column:1/-1">상대의 증강 선택을 기다리는 중입니다…</div>';}
  else for(const id of draft.offers){const a=byId[id],el=document.createElement('button');el.type='button';el.className='draft-card';el.disabled=processing;el.innerHTML='<span class="augment-grade">'+a.grade+'</span><span class="draft-icon">'+a.symbol+'</span><strong>'+a.name+'</strong><span class="draft-desc">'+a.desc+'</span><span class="draft-cost">'+a.cost+'</span><span class="draft-pick">이 증강 선택 →</span>';el.onclick=()=>dispatch({type:'draft',id});$('draftCards').appendChild(el);}
 }
 const pending=s.pending;$('requestOverlay').hidden=!pending;
 if(pending){const mine=pending.from===player;const label=pending.type==='undo'?'한 수 무르기':'새 대국';$('requestTitle').textContent=mine?label+' 동의 대기':label+' 요청 도착';$('requestBody').textContent=mine?'상대방의 응답을 기다리고 있어요.':(playerName(pending.from)+'이 '+label+'을 요청했습니다. 동의하시겠어요?');
  $('requestButtons').innerHTML='';if(mine){requestButton('요청 취소','cancel',()=>dispatch({type:'cancel'}));}else{requestButton('거절','decline',()=>dispatch({type:'respond',accept:false}));requestButton('동의','accept',()=>dispatch({type:'respond',accept:true}));}
 }
}
function requestButton(label,kind,handler){const b=document.createElement('button');b.className='btn'+(kind==='accept'?' primary':'');b.textContent=label;b.disabled=processing;b.onclick=handler;$('requestButtons').appendChild(b);}
for(let r=0;r<N;r++)for(let c=0;c<N;c++){
 const el=document.createElement('button');el.type='button';el.className='intersection'+(r===0?' edge-top':'')+(r===N-1?' edge-bottom':'')+(c===0?' edge-left':'')+(c===N-1?' edge-right':'');el.setAttribute('aria-label',coord(r,c));el.onclick=()=>onCell(r,c);boardEl.appendChild(el);
}
$('createRoom').onclick=createRoom;
$('joinForm').onsubmit=e=>{e.preventDefault();joinRoom($('joinCode').value)};
$('joinCode').oninput=()=>{$('joinCode').value=encode($('joinCode').value.toUpperCase()).slice(0,6)};
$('copyInvite').onclick=copyInvite;$('waitCopy').onclick=copyInvite;
$('leaveRoom').onclick=showLobby;$('waitLeave').onclick=showLobby;
$('undo').onclick=()=>dispatch({type:'request',what:'undo'});$('reset').onclick=()=>dispatch({type:'request',what:'restart'});
const initialRoom=new URLSearchParams(location.search).get('room');if(initialRoom&&encode(initialRoom.toUpperCase()).length===6){$('joinCode').value=encode(initialRoom.toUpperCase());joinRoom(initialRoom)}
})();
