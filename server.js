'use strict';
// No third-party packages needed: Node HTTP + Server-Sent Events for realtime updates.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {newGame,apply,undo,publicState,RuleError}=require('./gameEngine');
const PORT = Number(process.env.PORT)||3000;
const HOST = process.env.HOST||'0.0.0.0';
const BASE=path.join(__dirname,'public');
const rooms=new Map();
const CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODES=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const MAX_JSON=4096;
const respond=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
const error=(res,status,message)=>respond(res,status,{error:message});
const now=()=>Date.now();
function makeCode(){for(let attempt=0;attempt<20;attempt++){let s='';for(let i=0;i<6;i++)s+=CHARS[crypto.randomInt(CHARS.length)];if(!rooms.has(s))return s;}throw Error('방 생성에 실패했습니다.');}
function newRoom(){const code=makeCode(),token=crypto.randomBytes(24).toString('base64url');const room={code,game:newGame(),seats:{1:token,2:null},streams:{1:new Set(),2:new Set()},pending:null,created:now(),updated:now()};rooms.set(code,room);return{room,token};}
function playerByToken(room,token){if(typeof token!=='string'||token.length>256)return 0;return room.seats[1]===token?1:room.seats[2]===token?2:0;}
function presence(room){return {1:room.streams[1].size>0,2:room.streams[2].size>0};}
function view(room,p){return {...publicState(room.game,p,presence(room),room.pending),code:room.code,ready:!!room.seats[2]};}
function push(room){for(const p of [1,2]){const payload='data: '+JSON.stringify(view(room,p))+'\n\n';for(const stream of room.streams[p]){try{stream.write(payload);}catch{room.streams[p].delete(stream);}}}}
function getRoom(code,res){if(!CODES.test(code)) {error(res,404,'방 코드를 확인하세요.');return null;}const room=rooms.get(code);if(!room){error(res,404,'방을 찾을 수 없습니다. 서버가 다시 시작되면 기존 방이 사라질 수 있습니다.');return null;}return room;}
function readJson(req){return new Promise((resolve,reject)=>{let content='',len=0;req.on('data',chunk=>{len+=chunk.length;if(len>MAX_JSON){reject(new Error('요청이 너무 큽니다.'));req.destroy();return;}content+=chunk;});req.on('end',()=>{try{resolve(JSON.parse(content||'{}'));}catch{reject(new Error('JSON 형식이 올바르지 않습니다.'));}});req.on('error',reject);});}
function checkOrigin(req){const origin=req.headers.origin;if(!origin)return true;try{const u=new URL(origin);return u.host===req.headers.host;}catch{return false;}}
function staticFile(req,res,url){
 if(req.method!=='GET'&&req.method!=='HEAD')return error(res,405,'허용되지 않는 메서드입니다.');
 const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/client.js':'client.js'};
 const name=files[url.pathname];if(!name)return error(res,404,'페이지를 찾을 수 없습니다.');
 const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
 try{const content=fs.readFileSync(path.join(BASE,name));res.writeHead(200,{'Content-Type':types[path.extname(name)],'Content-Length':content.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'"});res.end(req.method==='HEAD'?undefined:content);}catch{error(res,500,'파일을 열 수 없습니다.');}
}
async function handle(req,res){
 const url=new URL(req.url,'http://localhost');const parts=url.pathname.split('/').filter(Boolean);
 if(req.method==='GET'&&url.pathname==='/health')return respond(res,200,{ok:true,rooms:rooms.size});
 if(parts[0]!=='api')return staticFile(req,res,url);
 if(req.method==='POST'&&!checkOrigin(req))return error(res,403,'허용되지 않은 요청입니다.');
 if(req.method==='POST'&&url.pathname==='/api/rooms'){
  const {room,token}=newRoom();return respond(res,201,{code:room.code,token,player:1});
 }
 if(parts.length!==4||parts[1]!=='rooms')return error(res,404,'잘못된 API 주소입니다.');
 const code=parts[2].toUpperCase(),verb=parts[3],room=getRoom(code,res);if(!room)return;
 if(req.method==='POST'&&verb==='join'){
  const data=await readJson(req);let player=playerByToken(room,data.token),token=data.token;
  if(!player){if(room.seats[2])return error(res,409,'이미 두 명이 입장한 방입니다.');token=crypto.randomBytes(24).toString('base64url');room.seats[2]=token;player=2;}
  room.updated=now();push(room);return respond(res,200,{code,token,player});
 }
 if(req.method==='GET'&&verb==='events'){
  const player=playerByToken(room,url.searchParams.get('token'));if(!player)return error(res,401,'방 입장 정보가 올바르지 않습니다.');
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
  res.write('retry: 2000\n\n');room.streams[player].add(res);room.updated=now();push(room);
  const ping=setInterval(()=>{try{res.write(': keepalive\n\n')}catch{}},20000);ping.unref?.();
  let closed=false;const clean=()=>{if(closed)return;closed=true;clearInterval(ping);room.streams[player].delete(res);push(room);};
  res.on('close',clean);return;
 }
 if(req.method==='GET'&&verb==='state'){
  const player=playerByToken(room,url.searchParams.get('token'));if(!player)return error(res,401,'방 입장 정보가 올바르지 않습니다.');return respond(res,200,view(room,player));
 }
 if(req.method!=='POST'||verb!=='action')return error(res,404,'요청을 찾을 수 없습니다.');
 const data=await readJson(req),player=playerByToken(room,data.token),action=data.action;
 if(!player)return error(res,401,'입장 토큰이 올바르지 않습니다.');
 if(!room.seats[2])return error(res,409,'상대가 방에 들어올 때까지 기다려주세요.');
 if(!action||typeof action!=='object')return error(res,400,'요청한 동작이 올바르지 않습니다.');
 if(action.type==='request'){
  if(!['undo','restart'].includes(action.what))return error(res,400,'지원하지 않는 요청입니다.');
  if(room.pending)return error(res,409,'이미 대기 중인 요청이 있습니다.');
  if(action.what==='undo'&&!room.game.undoStack.length)return error(res,409,'무를 수가 없습니다.');
  if(action.what==='undo'&&room.game.state.draft)return error(res,409,'증강 선택 중에는 무르기를 요청할 수 없습니다.');
  room.pending={type:action.what,from:player};
 }else if(action.type==='respond'){
  if(!room.pending||room.pending.from===player)return error(res,409,'응답할 요청이 없습니다.');
  const pending=room.pending;room.pending=null;
  if(action.accept===true){if(pending.type==='restart')room.game=newGame();else undo(room.game);}
 }else if(action.type==='cancel'){
  if(!room.pending||room.pending.from!==player)return error(res,409,'취소할 요청이 없습니다.');
  room.pending=null;
 }else{
  if(room.pending)return error(res,409,'무르기 또는 새 대국 요청을 먼저 처리해주세요.');
  apply(room.game,player,action);
 }
 room.updated=now();push(room);respond(res,200,{ok:true});
}
const server=http.createServer((req,res)=>{Promise.resolve(handle(req,res)).catch(e=>{
 if(e instanceof RuleError)return error(res,400,e.message);
 if(e instanceof SyntaxError)return error(res,400,'요청 형식이 잘못되었습니다.');
 console.error('Request error:',e.message);if(!res.headersSent)error(res,500,e.message==='요청이 너무 큽니다.'?e.message:'서버 오류가 발생했습니다.');else res.end();
});});
// Unused rooms expire after a day when neither player is connected.
const cleanup=setInterval(()=>{for(const [code,room] of rooms)if(!presence(room)[1]&&!presence(room)[2]&&now()-room.updated>24*3600_000)rooms.delete(code);},3600_000);cleanup.unref?.();
if(require.main===module)server.listen(PORT,HOST,()=>console.log(`증강 오목 멀티 서버: http://localhost:${PORT}`));
module.exports={server,rooms};
