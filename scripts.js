"use strict";
const RAW = JSON.parse(document.getElementById('bundle').textContent);
const PAL = ['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];
// Partidos que tienen timeline del anotador con links a YouTube (id -> ruta). Agregar acá los nuevos.
const TIMELINES = {"32":"timelines/20260906_timeline.html"};

let MATCHES = new Map(), PLAYERS = new Map(), STATS = null;

function ingest(bundle, override){
  (bundle.jugadores||[]).forEach(j=>{ if(!PLAYERS.has(j.id)||override) PLAYERS.set(j.id, j); });
  (bundle.partidos||[]).forEach(m=> MATCHES.set(String(m.id), normalizeMatch(m)));
}
function ingestMatch(m, override){
  if(!m||m.id==null) return; const id=String(m.id);
  if(MATCHES.has(id) && !override) return;
  MATCHES.set(id, normalizeMatch(m));
  (m.players?.[1]||[]).concat(m.players?.[2]||[]).forEach(p=>{ if(!PLAYERS.has(p)) PLAYERS.set(p,{id:p,nombre:p}); });
}
function normalizeMatch(m){
  const mm=Object.assign({}, m);
  if(!mm.golesEquipo){ const g={1:0,2:0}; (mm.events||[]).forEach(e=>{ if(e.type==='gol') g[e.team]=(g[e.team]||0)+1; }); mm.golesEquipo=g; }
  return mm;
}
function matchResult(m){ const g1=m.golesEquipo?.[1],g2=m.golesEquipo?.[2];
  if(g1!=null&&g2!=null){ if(g1>g2)return 1; if(g2>g1)return 2; return 0; }
  if(m.ganador===1||m.ganador===2||m.ganador===0) return m.ganador; return null; }
function teamOf(m,p){ if((m.players?.[1]||[]).includes(p))return 1; if((m.players?.[2]||[]).includes(p))return 2; return null; }
function keepersOf(m,team){ const s=new Set(); (m.resumenJugadores||[]).forEach(r=>{ if(r.equipo===team&&(r.minutosArco||0)>0&&r.jugador)s.add(r.jugador); }); if(m.gk&&m.gk[team])s.add(m.gk[team]); return s; }
function resumenOf(m,p){ return (m.resumenJugadores||[]).find(r=>r.jugador===p)||null; }
function present(m){ return new Set((m.events||[]).map(e=>e.type)); }

function compute(){
  const P={};
  const ensure=id=>{ if(!P[id])P[id]={id,pj:0,g:0,a:0,oc:0,at:0,q:0,sh:0,w:0,d:0,l:0,
    minArcoSum:0,minArcoN:0,golArcoSum:0,golArcoN:0,byMatch:[]}; return P[id]; };
  const pair={}, rival={}, assistEdge={}, coEdge={};
  const matches=[...MATCHES.values()].sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||(+a.id-+b.id));
  const ORDER=matches.map(m=>String(m.id));   // orden cronológico de la temporada (para rachas de partidos seguidos)
  matches.forEach(m=>{
    const res=matchResult(m); const roster={1:(m.players?.[1]||[]),2:(m.players?.[2]||[])};
    const per={}; [1,2].forEach(t=>roster[t].forEach(p=>{per[p]={g:0,a:0,oc:0,at:0,q:0,sh:0,team:t};ensure(p);}));
    (m.events||[]).forEach(e=>{ const {type,p1,p2}=e;
      if(type==='gol'){
        if(!e.enContra && p1 && per[p1]) per[p1].g++;              // gol: no cuenta si es en contra
        if(p2 && per[p2]) per[p2].a++;                             // asistencia: cuenta siempre (incl. en contra)
        if(!e.enContra && p1 && p2 && per[p1] && per[p2]){ const k=p2+'→'+p1; assistEdge[k]=(assistEdge[k]||0)+1; } }
      else if(type==='tiro'){ if(p1&&per[p1])per[p1].sh++; }
      else if(type==='atajada'){ if(p1&&per[p1])per[p1].at++; }
      else if(type==='ocasion'){ if(p1&&per[p1])per[p1].oc++; }
      else if(type==='quite'){ if(p1&&per[p1])per[p1].q++; }
    });
    [1,2].forEach(t=>{ roster[t].forEach(p=>{ const c=per[p],a=ensure(p); a.pj++;
      a.g+=c.g;a.a+=c.a;a.oc+=c.oc;a.at+=c.at;a.q+=c.q;a.sh+=c.sh;
      const rr2=resumenOf(m,p);   // minutos al arco / goles-por-min según la pestaña equipos
      if(rr2){ if(rr2.minutosArco!=null){ a.minArcoSum+=rr2.minutosArco; a.minArcoN++;   // denominador: partidos con dato (D<>"")
          if(rr2.minutosArco>0) a.golArcoN++; }                                          // denominador goles/min: D>0
        if(rr2.golesArcoMin!=null) a.golArcoSum+=rr2.golesArcoMin; }
      let rr=res==null?null:(res===0?'d':(res===t?'w':'l')); if(rr==='w')a.w++;else if(rr==='l')a.l++;else if(rr==='d')a.d++;
      a.byMatch.push({id:m.id,fecha:m.fecha,team:t,res:rr,g:c.g,a:c.a,ga:c.g+c.a,oc:c.oc,at:c.at,q:c.q}); });
      const rs=roster[t];
      for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){ const k=[rs[i],rs[j]].sort().join('|');
        if(!pair[k])pair[k]={together:0,wins:0,draws:0}; pair[k].together++; if(res===t)pair[k].wins++; else if(res===0)pair[k].draws++; coEdge[k]=(coEdge[k]||0)+1; }
    });
    roster[1].forEach(a=>roster[2].forEach(b=>{ addRival(rival,a,b,res,1); addRival(rival,b,a,res,2); }));
  });
  Object.values(P).forEach(a=>{ a.ga=a.g+a.a; a.pts=3*a.w+a.d;
    a.winpct=(a.w+a.l+a.d)?a.w/(a.w+a.l+a.d):0; a.gpp=a.pj?a.g/a.pj:0; a.app=a.pj?a.a/a.pj:0;
    a.minArcoPP = a.minArcoN? a.minArcoSum/a.minArcoN : null;   // prom. sobre partidos con dato de arco
    a.golMin    = a.golArcoN? a.golArcoSum/a.golArcoN : null;   // goles/min en el arco (partidos con D>0)
    a.records=playerRecords(a, ORDER); });
  STATS={P,pair,rival,assistEdge,coEdge,matches,season:seasonRecords(P)};
  return STATS;
}
function addRival(rival,a,b,res,aTeam){ if(!rival[a])rival[a]={}; if(!rival[a][b])rival[a][b]={games:0,beat:0,lost:0}; const r=rival[a][b]; r.games++; if(res===aTeam)r.beat++; else if(res!=null&&res!==0)r.lost++; }
function maxStreak(arr,pred){ let m=0,c=0; arr.forEach(x=>{ if(pred(x)){c++; if(c>m)m=c;} else c=0; }); return m; }
function playerRecords(a, order){ const b=a.byMatch;
  const mg=Math.max(0,...b.map(x=>x.g)); const maxG={v:mg, ms:b.filter(x=>x.g===mg&&mg>0).map(x=>x.id)};
  const ma=Math.max(0,...b.map(x=>x.a)); const maxA={v:ma, ms:b.filter(x=>x.a===ma&&ma>0).map(x=>x.id)};
  const played=new Set(b.map(x=>String(x.id)));
  let run=0,sp=0; (order||[]).forEach(id=>{ if(played.has(id)){run++; if(run>sp)sp=run;} else run=0; });
  return { maxG, maxA, streakPlayed:sp,
    streakG:maxStreak(b,x=>x.g>0), streakA:maxStreak(b,x=>x.a>0), streakW:maxStreak(b,x=>x.res==='w'), streakUnbeaten:maxStreak(b,x=>x.res==='w'||x.res==='d') }; }
// récords de temporada: valor máximo + TODOS los jugadores que lo comparten
function seasonRecords(P){ const arr=Object.values(P);
  const top=(getv)=>{ let mx=0; arr.forEach(a=>{const v=getv(a); if(v>mx)mx=v;}); const who=arr.filter(a=>getv(a)===mx&&mx>0).map(a=>a.id); return {v:mx,who}; };
  return { maxG:top(a=>a.records.maxG.v), maxA:top(a=>a.records.maxA.v),
    streakG:top(a=>a.records.streakG), streakA:top(a=>a.records.streakA),
    streakW:top(a=>a.records.streakW), streakPlayed:top(a=>a.records.streakPlayed) }; }

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const tt=$('#tt');
// Solo mostramos tooltips en dispositivos con mouse; en touch (celu) no aplican y quedaban pegados en pantalla.
const HOVER = !!(window.matchMedia && matchMedia('(hover: hover)').matches);
function showTT(html,x,y){ if(!HOVER)return; tt.innerHTML=html; tt.style.opacity=1; let l=x+14,t=y+14; if(l>innerWidth-270)l=x-tt.offsetWidth-14; tt.style.left=l+'px'; tt.style.top=t+'px'; }
function hideTT(){ tt.style.opacity=0; }
function colorFor(id){ const idx=[...PLAYERS.keys()].sort().indexOf(id); return `var(${PAL[(idx<0?0:idx)%PAL.length]})`; }
function nm(id){ const p=PLAYERS.get(id); return (p&&p.apodo)||(p&&p.nombre)||id; }   // etiqueta corta = apodo
function fullName(id){ const p=PLAYERS.get(id); if(!p)return null; const n=[p.nombre,p.apellido].filter(Boolean).join(' ').trim(); return n||null; }
function playerRank(id){ const arr=Object.values(STATS.P).slice().sort((a,b)=>b.pts-a.pts||b.g-a.g||b.a-a.a||b.winpct-a.winpct); return arr.findIndex(x=>x.id===id)+1; }
function pct(n){ return (n==null||isNaN(n))?'–':(n*100).toFixed(0)+'%'; }
function fmt(n,d=0){ return (n==null||isNaN(n))?'–':Number(n).toFixed(d); }

/* ---- tabla ---- */
let sortKey=null, sortAsc=false, minPjOnly=true;
const COLS=[
  {k:'rank',t:'#',v:(r,i)=>i+1,so:false},
  {k:'nombre',t:'Jugador',v:r=>r.nombre,left:true,so:false},
  {k:'pts',t:'Pts',hi:true,tip:'Puntos: 3 por ganar, 1 por empatar, 0 por perder'},
  {k:'pj',t:'PJ',tip:'Partidos jugados'},
  {k:'g',t:'G',tip:'Goles'},
  {k:'a',t:'A',tip:'Asistencias'},
  {k:'w',t:'Gan',tip:'Partidos ganados'},
  {k:'d',t:'Emp',tip:'Partidos empatados'},
  {k:'l',t:'Per',tip:'Partidos perdidos'},
  {k:'winpct',t:'Win%',v:r=>pct(r.winpct),tip:'Porcentaje de partidos ganados'},
  {k:'minArcoPP',t:'Min.arco/P',v:r=>r.minArcoPP==null?'–':r.minArcoPP.toFixed(1),tip:'Minutos promedio en el arco por partido'},
  {k:'golMin',t:'GA/min',v:r=>r.golMin==null?'–':r.golMin.toFixed(2),tip:'Goles recibidos por minuto en el arco'},
];
function rows(){
  let arr=Object.values(STATS.P).map(a=>Object.assign({},a,{nombre:nm(a.id)}));
  if(minPjOnly)arr=arr.filter(r=>r.pj>=5);
  if(sortKey){ arr.sort((a,b)=>{ const x=a[sortKey],y=b[sortKey]; return sortAsc?(x>y?1:x<y?-1:0):(x<y?1:x>y?-1:0); }); }
  else { arr.sort((a,b)=> b.pts-a.pts || b.g-a.g || b.a-a.a || b.winpct-a.winpct); }
  return arr;
}
function renderTable(){
  const t=$('#mainTable'), arr=rows(); let h='<thead><tr>';
  COLS.forEach(c=>{ const s=(c.k===sortKey?'sorted '+(sortAsc?'asc':''):'')+(c.tip?' hpt':''); h+=`<th class="${s}" data-k="${c.k}" ${c.tip?`data-tip="${c.tip}"`:''} ${c.so===false?'style="cursor:default"':''}>${c.t}</th>`; });
  h+='</tr></thead><tbody>';
  arr.forEach((r,i)=>{ h+='<tr data-p="'+r.id+'">';
    COLS.forEach(c=>{ if(c.k==='rank')h+=`<td>${i+1}</td>`;
      else if(c.k==='nombre')h+=`<td><span class="pname"><span class="dot" style="background:${colorFor(r.id)}"></span>${r.nombre}</span></td>`;
      else h+=`<td class="${c.hi?'hi':''}">${c.v?c.v(r,i):r[c.k]}</td>`; });
    h+='</tr>'; });
  t.innerHTML=h+'</tbody>';
  t.querySelectorAll('th[data-k]').forEach(th=>{ const c=COLS.find(x=>x.k===th.dataset.k); if(c&&c.so===false)return;
    th.onclick=()=>{ hideTT(); if(sortKey===th.dataset.k){ if(!sortAsc){sortAsc=true;} else {sortKey=null;sortAsc=false;} } else {sortKey=th.dataset.k;sortAsc=false;} renderTable(); }; });
  t.querySelectorAll('tbody tr').forEach(tr=>tr.onclick=()=>gotoPlayer(tr.dataset.p));
  attachSVGHovers();   // tooltips en los encabezados (.hpt)
}

/* ---- rankings ---- */
let rankKey='goles', rankMinPj=true, rankAvgMode=false;
// histograma de barras verticales: data=[{lab,v}]
function barsHist(data,color){
  const n=data.length, W=Math.max(300,n*30+40), H=190, pad=24, slot=(W-2*pad)/n, bw=Math.max(9,slot-6);
  const max=Math.max(1,...data.map(d=>d.v));
  const y=v=>H-pad-v/max*(H-2*pad-12);
  let g='';
  data.forEach((d,i)=>{ const bx=pad+i*slot+(slot-bw)/2, by=y(d.v), hh=H-pad-by;
    g+=`<rect class="hpt" data-tip="${d.tip||(d.lab+': '+d.v)}" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,hh).toFixed(1)}" rx="3" fill="${color}"/>`;
    if(d.v>0)g+=`<text x="${(bx+bw/2).toFixed(1)}" y="${(by-3).toFixed(1)}" font-size="9.5" text-anchor="middle" fill="var(--ink2)">${d.v}</text>`;
    g+=`<text x="${(bx+bw/2).toFixed(1)}" y="${H-pad+13}" font-size="9.5" text-anchor="middle">${d.lab}</text>`; });
  g+=`<line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--axis)"/>`;
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" style="min-width:${Math.min(W,520)}px">${g}</svg></div>`;
}
function renderRank(){
  const perMatch = rankAvgMode && (rankKey==='goles'||rankKey==='asis');   // toggle total/promedio (solo goles y asist.)
  const titles={goles:'Goleadores',asis:'Asistencias',impacto:'Impacto (G+A por partido)',winpct:'Win %'};
  $('#rankTitle').textContent=titles[rankKey]+(perMatch?' · promedio por partido':'');
  const avg=(rankKey==='winpct'||rankKey==='impacto'||perMatch);
  $('#rankSub').textContent=(rankKey==='impacto'?'(Goles+Asistencias) / partidos jugados. ':rankKey==='winpct'?'Porcentaje de victorias. ':perMatch?'Promedio por partido jugado. ':'Total de la temporada. ')+(avg?(rankMinPj?'Mínimo 5 PJ.':'Sin mínimo de PJ.'):'');
  const getv=a=>rankKey==='goles'?(perMatch?(a.pj?a.g/a.pj:0):a.g):rankKey==='asis'?(perMatch?(a.pj?a.a/a.pj:0):a.a):rankKey==='impacto'?(a.pj?a.ga/a.pj:0):a.winpct;
  let arr=Object.values(STATS.P).map(a=>({id:a.id,val:getv(a),pj:a.pj}));
  if(rankMinPj)arr=arr.filter(r=>r.pj>=5);   // el ≥5 PJ filtra siempre (también en totales)
  arr=arr.filter(r=>r.val>0).sort((a,b)=>b.val-a.val);   // todos los que tienen el dato (sin tope)
  const max=Math.max(0.0001,...arr.map(r=>r.val));
  const fv=v=>rankKey==='winpct'?(v*100).toFixed(0)+'%':(rankKey==='impacto'||perMatch)?v.toFixed(2):String(v);
  $('#rankBars').innerHTML=arr.map(r=>`<div class="brow" data-p="${r.id}" style="cursor:pointer">
    <span class="nm">${nm(r.id)}</span><span class="btrk"><span class="bfil" style="width:${(r.val/max*100).toFixed(1)}%;background:${colorFor(r.id)}"></span></span>
    <span class="vv">${fv(r.val)}</span></div>`).join('')||'<p class="muted">Sin datos.</p>';
  $$('#rankBars .brow').forEach(b=>b.onclick=()=>gotoPlayer(b.dataset.p));
  // season records (con empates: primero + "+N", hover lista a todos)
  const s=STATS.season;
  const rec=(label,x)=>{ const many=(x.who||[]).length>1; const disp=x.v?(nm(x.who[0])+(many?` +${x.who.length-1}`:'')):'–';
    return `<div class="rec ${many?'hpt':''}" ${many?`data-tip="${x.who.map(nm).join(', ')}"`:''}><div class="rv">${x.v||0}</div><div class="rk">${label}</div><div class="rd">${disp}</div></div>`; };
  $('#seasonRecs').innerHTML=[
    rec('Más goles en un partido',s.maxG),
    rec('Más asistencias en un partido',s.maxA),
    rec('Racha goleadora (partidos seguidos)',s.streakG),
    rec('Racha de asistencias',s.streakA),
    rec('Racha ganadora',s.streakW),
    rec('Más partidos seguidos jugados',s.streakPlayed),
  ].join('');
  // totales de temporada
  const ms=STATS.matches;
  const gt=m=>((m.golesEquipo&&m.golesEquipo[1])||0)+((m.golesEquipo&&m.golesEquipo[2])||0);
  const totG=ms.reduce((s2,m)=>s2+gt(m),0);
  let totA=0; ms.forEach(m=>(m.events||[]).forEach(e=>{ if(e.type==='gol'&&e.p2)totA++; }));
  const mostG=ms.slice().sort((a,b)=>gt(b)-gt(a))[0];
  const longest=ms.filter(m=>m.minutos).slice().sort((a,b)=>b.minutos-a.minutos)[0];
  const card2=(v,k,d)=>`<div class="rec"><div class="rv">${v}</div><div class="rk">${k}</div><div class="rd">${d||'&nbsp;'}</div></div>`;
  $('#seasonTotals').innerHTML=[
    card2(totG,'Goles totales','en '+ms.length+' partidos'),
    card2(totA,'Asistencias totales',''),
    mostG?card2(gt(mostG),'Partido con más goles','P'+mostG.id+' · '+(mostG.golesEquipo[1])+'-'+(mostG.golesEquipo[2])):'',
    longest?card2(longest.minutos+"'",'Partido más largo','P'+longest.id+' · '+(longest.fecha||'')):'',
  ].join('');
  // histogramas
  const totByMatch=ms.map(m=>gt(m));
  const mn=Math.min(...totByMatch), mx=Math.max(...totByMatch); const gpp=[];
  for(let k=mn;k<=mx;k++){ const c=totByMatch.filter(t=>t===k).length; gpp.push({lab:String(k),v:c,tip:k+' goles → '+c+' partido(s)'}); }
  const mins=[]; ms.forEach(m=>(m.events||[]).forEach(e=>{ if(e.type==='gol'&&e.minuto!=null)mins.push(e.minuto); }));
  let gpm=[]; if(mins.length){ const nb=Math.floor(Math.max(...mins)/5)+1;
    for(let k=0;k<nb;k++){ const lo=k*5,hi=lo+5,c=mins.filter(x=>x>=lo&&x<hi).length; gpm.push({lab:String(lo),v:c,tip:"minuto "+lo+"–"+hi+" → "+c+" goles"}); } }
  $('#histos').innerHTML=`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
    <div><div class="sub" style="margin-bottom:2px">Goles por partido</div>${barsHist(gpp,'var(--s1)')}<div class="hint" style="text-align:center">goles totales del partido → nº de partidos</div></div>
    <div><div class="sub" style="margin-bottom:2px">Goles por minuto (bines de 5')</div>${gpm.length?barsHist(gpm,'var(--s2)'):'<p class="muted">Sin minutos de gol.</p>'}<div class="hint" style="text-align:center">minuto del partido → nº de goles</div></div>
  </div>`;
  attachSVGHovers();
}

/* ---- perfil ---- */
function gotoPlayer(id){ selectTab('perfil'); $('#playerSel').value=id; renderPerfil(id); }
function tile(v,k,extra){ return `<div class="tile"><div class="v">${v}${extra?' <small>'+extra+'</small>':''}</div><div class="k">${k}</div></div>`; }
function renderPerfil(id){
  const a=STATS.P[id]; if(!a){ $('#perfilBody').innerHTML='<p class="muted">Sin datos.</p>'; return; }
  const R=a.records; const fn=fullName(id); const rk=playerRank(id);
  let h=`<div style="margin-bottom:12px"><span style="font-size:22px;font-weight:700;letter-spacing:-.02em">${fn||nm(id)}</span>${fn?` <span class="muted" style="font-size:15px">· ${nm(id)}</span>`:''}</div>`;
  h+=`<div class="tiles">
    ${tile(a.pj,'Partidos')}
    ${tile(a.pts,'Puntos','(#'+rk+')')}
    ${tile(a.g,'Goles','('+fmt(a.gpp,2)+'/P)')}
    ${tile(a.a,'Asistencias','('+fmt(a.app,2)+'/P)')}
    ${tile(a.minArcoPP==null?'–':fmt(a.minArcoPP,1),'Min. al arco/P')}
    ${tile(a.golMin==null?'–':fmt(a.golMin,2),'Goles/min arco')}
    ${tile(pct(a.winpct),'Win %')}
    ${tile(`${a.w}-${a.d}-${a.l}`,'Gan-Emp-Per')}
  </div>`;
  h+=`<div class="card"><h3>Récords y rachas</h3><div class="sub">las marcas propias de ${nm(id)} en la temporada</div>
    <div class="recs">
      ${recMulti(R.maxG.v,'Máx. goles en un partido',R.maxG.ms)}
      ${recMulti(R.maxA.v,'Máx. asistencias en un partido',R.maxA.ms)}
      ${recCard(R.streakG,'Racha goleadora','partidos seguidos con gol')}
      ${recCard(R.streakA,'Racha de asistencias','partidos seguidos asistiendo')}
      ${recCard(R.streakW,'Racha ganadora','victorias seguidas')}
      ${recCard(R.streakUnbeaten,'Racha sin perder','ganando o empatando')}
    </div></div>`;
  h+=`<div class="card"><h3>Goles + asistencias por partido</h3><div class="sub">a lo largo de la temporada · verde ganó, rojo perdió, gris empató</div>${evoSVG(id)}</div>`;
  h+=`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px" id="pcols">
    <div class="card"><h3>Compañeros más frecuentes</h3><div class="sub">partidos jugados en el mismo equipo</div>${teammatesList(id)}</div>
    <div class="card"><h3>Mejores duplas</h3><div class="sub">win% jugando juntos (≥4 partidos)</div>${duosList(id)}</div>
    <div class="card"><h3>Le asiste a / lo asisten</h3><div class="sub">goles conectados</div>${assistList(id)}</div>
    <div class="card"><h3>Rivales difíciles</h3><div class="sub">contra quién más perdés (≥4 partidos)</div>${nemesisList(id)}</div>
  </div>`;
  $('#perfilBody').innerHTML=h;
  attachSVGHovers(); $$('#perfilBody .brow[data-p]').forEach(b=>b.onclick=()=>gotoPlayer(b.dataset.p));
}
function recCard(v,k,d){ return `<div class="rec"><div class="rv">${v||0}</div><div class="rk">${k}</div><div class="rd">${d||''}</div></div>`; }
function recMulti(v,label,ms){ ms=ms||[]; const many=ms.length>1;
  const vis = v?(many? ('P'+ms[0]+' +'+(ms.length-1)) : ('partido '+ms[0])) : '';
  return `<div class="rec ${many?'hpt':''}" ${many?`data-tip="Partidos: ${ms.map(x=>'P'+x).join(', ')}"`:''}><div class="rv">${v||0}</div><div class="rk">${label}</div><div class="rd">${vis}</div></div>`; }
function evoSVG(id){ const d=STATS.P[id].byMatch; if(!d.length)return '<p class="muted">Sin partidos.</p>';
  const W=640,H=170,pad=26,bw=Math.max(4,(W-2*pad)/d.length-3), max=Math.max(3,...d.map(x=>x.ga));
  const x=i=>pad+i*(W-2*pad)/d.length, y=v=>H-pad-v/max*(H-2*pad-6);
  let g='';
  [0,max].forEach(v=>{ g+=`<line x1="${pad}" y1="${y(v)}" x2="${W-pad}" y2="${y(v)}" stroke="var(--grid)"/><text x="${pad-6}" y="${y(v)+3}" font-size="10" text-anchor="end">${v}</text>`; });
  d.forEach((p,i)=>{ const col=p.res==='w'?'var(--good)':p.res==='l'?'var(--bad)':'var(--muted)'; const hh=H-pad-y(p.ga);
    g+=`<rect class="hpt" data-tip="P${p.id} · ${p.fecha||''}<br><b>${p.g} goles · ${p.a} asist.</b>" x="${x(i)}" y="${y(p.ga)}" width="${bw}" height="${Math.max(0,hh)}" rx="2" fill="${col}" fill-opacity="0.85"/>`; });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="170" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}
function teammatesList(id){ const out=[];
  Object.entries(STATS.pair).forEach(([k,v])=>{ const ps=k.split('|'); if(!ps.includes(id))return; const o=ps[0]===id?ps[1]:ps[0]; out.push({o,g:v.together}); });
  out.sort((a,b)=>b.g-a.g); const top=out.slice(0,6);
  if(!top.length)return '<p class="muted">Sin datos.</p>';
  const max=Math.max(1,...top.map(o=>o.g));
  return '<div class="bars">'+top.map(o=>`<div class="brow" data-p="${o.o}" style="cursor:pointer;grid-template-columns:96px 1fr 46px"><span class="nm">${nm(o.o)}</span><span class="btrk"><span class="bfil" style="width:${(o.g/max*100).toFixed(0)}%;background:${colorFor(o.o)}"></span></span><span class="vv">${o.g} <span class="muted">PJ</span></span></div>`).join('')+'</div>';
}
function duosList(id){ const out=[];
  Object.entries(STATS.pair).forEach(([k,v])=>{ const ps=k.split('|'); if(!ps.includes(id)||v.together<4)return; const o=ps[0]===id?ps[1]:ps[0]; out.push({o,wr:v.wins/v.together,g:v.together,w:v.wins}); });
  out.sort((a,b)=>b.wr-a.wr||b.g-a.g); const top=out.slice(0,6);
  if(!top.length)return '<p class="muted">Pocos partidos compartidos.</p>';
  return '<div class="bars">'+top.map(o=>`<div class="brow" data-p="${o.o}" style="cursor:pointer;grid-template-columns:96px 1fr 58px"><span class="nm">${nm(o.o)}</span><span class="btrk"><span class="bfil" style="width:${(o.wr*100).toFixed(0)}%;background:var(--good)"></span></span><span class="vv">${(o.wr*100).toFixed(0)}% <span class="muted">(${o.w}/${o.g})</span></span></div>`).join('')+'</div>';
}
function assistList(id){ const gave={},got={};
  Object.entries(STATS.assistEdge).forEach(([k,c])=>{ const[f,t]=k.split('→'); if(f===id)gave[t]=(gave[t]||0)+c; if(t===id)got[f]=(got[f]||0)+c; });
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const seg=(o,verb)=>{ const t=top(o); if(!t.length)return `<div class="muted" style="font-size:12px">${verb}: –</div>`;
    return `<div style="font-size:12px;color:var(--ink2);margin-bottom:2px">${verb}:</div>`+t.map(([n,c])=>`<div class="brow" style="grid-template-columns:1fr 40px;cursor:pointer" data-p="${n}"><span class="nm">${nm(n)}</span><span class="vv">${c}</span></div>`).join(''); };
  return seg(gave,'Le asiste a')+'<div style="height:8px"></div>'+seg(got,'Lo asisten');
}
function nemesisList(id){ const r=STATS.rival[id]||{}; const arr=Object.entries(r).map(([o,v])=>({o,...v,lr:v.games?v.lost/v.games:0})).filter(x=>x.games>=4).sort((a,b)=>b.lr-a.lr||b.games-a.games).slice(0,6);
  if(!arr.length)return '<p class="muted">Pocos cruces.</p>';
  return '<div class="bars">'+arr.map(o=>`<div class="brow" data-p="${o.o}" style="cursor:pointer;grid-template-columns:96px 1fr 58px"><span class="nm">${nm(o.o)}</span><span class="btrk"><span class="bfil" style="width:${(o.lr*100).toFixed(0)}%;background:var(--bad)"></span></span><span class="vv">${(o.lr*100).toFixed(0)}% <span class="muted">(${o.lost}/${o.games})</span></span></div>`).join('')+'</div>';
}

/* ---- quimica ---- */
let quimMode='winmat', coplayThresh=4;
function renderQuim(){
  const card=$('#quimCard');
  if(quimMode==='winmat'){ card.innerHTML='<h3>Win% jugando juntos</h3><div class="sub">jugadores con ≥8 partidos; celdas con ≥4 partidos compartidos</div>'+winMatrix()
      +`<div class="legend"><span><span class="sw" style="background:var(--bad)"></span>&lt;25%</span><span><span class="sw" style="background:var(--warn)"></span>25–50%</span><span><span class="sw" style="background:var(--good)"></span>&gt;50%</span></div>`;
    $('#quimHint').textContent='Color según win% de la dupla (rojo/amarillo/verde). Pasá el mouse por una celda para ver ganados, empatados y perdidos.'; attachSVGHovers(); }
  else if(quimMode==='coplay'){
    card.innerHTML=`<h3>Con quién juega cada uno</h3><div class="sub">líneas más gruesas = más partidos en el mismo equipo · solo se muestran duplas con al menos ${coplayThresh} partidos juntos</div>
      <div class="controls" style="margin:2px 0 8px"><label class="lbl">Mín. partidos juntos para el link:</label><div class="seg" id="ctSeg">${[2,3,4,5,6].map(n=>`<button data-ct="${n}" aria-pressed="${n===coplayThresh}">${n}</button>`).join('')}</div></div>`
      +network(STATS.coEdge,false,coplayThresh);
    $('#ctSeg').onclick=e=>{ const b=e.target.closest('button'); if(!b)return; coplayThresh=+b.dataset.ct; renderQuim(); };
    $('#quimHint').textContent='Cada nodo es un jugador; la línea une a los que compartieron equipo al menos '+coplayThresh+' veces (más gruesa = más veces). Pasá el mouse por un nodo para resaltar sus conexiones, o clic para ir a su perfil.'; attachNetHovers(); }
  else { card.innerHTML='<h3>Red de asistencias</h3><div class="sub">flecha del asistidor al goleador; más gruesa = más goles conectados</div>'+network(STATS.assistEdge,true,2);
    $('#quimHint').textContent='Quién le da de comer a quién. La flecha va del que asiste al que define.'; attachNetHovers(); }
}
function winColor(wr){ // 3-band red/yellow/green with intensity
  if(wr<0.25){ const t=0.4+0.6*(1-wr/0.25); return `rgba(208,59,59,${t.toFixed(2)})`; }
  if(wr<0.5){ const t=0.45+0.45*((wr-0.25)/0.25); return `rgba(245,179,1,${t.toFixed(2)})`; }
  const t=0.4+0.6*Math.min(1,(wr-0.5)/0.4); return `rgba(12,163,12,${t.toFixed(2)})`;
}
function winMatrix(){
  const ids=Object.values(STATS.P).filter(a=>a.pj>=8).map(a=>a.id).sort((a,b)=>STATS.P[b].pj-STATS.P[a].pj);
  const n=ids.length, cell=Math.max(18,Math.min(34,Math.floor(820/(n+3)))), lab=64, sz=lab+n*cell+8;
  let g=`<div style="overflow:auto"><svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" style="max-width:100%">`;
  ids.forEach((id,j)=>{ const s=nm(id).slice(0,6);
    g+=`<text x="${lab-4}" y="${lab+j*cell+cell/2+3}" font-size="10" text-anchor="end">${s}</text>`;
    g+=`<text transform="translate(${lab+j*cell+cell/2},${lab-6}) rotate(-55)" font-size="10" text-anchor="start">${s}</text>`; });
  ids.forEach((a,r)=>ids.forEach((b,c)=>{
    if(a===b){ g+=`<rect x="${lab+c*cell}" y="${lab+r*cell}" width="${cell-2}" height="${cell-2}" fill="var(--surface2)" rx="2"/>`; return; }
    const k=[a,b].sort().join('|'), v=STATS.pair[k]; let fill='var(--surface2)',tip=`${nm(a)} + ${nm(b)}: sin datos`;
    if(v&&v.together>=4){ const wr=v.wins/v.together, l=v.together-v.wins-v.draws; fill=winColor(wr);
      tip=`${nm(a)} + ${nm(b)}<br><b>${(wr*100).toFixed(0)}% ganados</b><br>${v.together} juntos · ${v.wins}G ${v.draws}E ${l}P`; }
    g+=`<rect class="hpt" data-tip="${tip}" x="${lab+c*cell}" y="${lab+r*cell}" width="${cell-2}" height="${cell-2}" fill="${fill}" rx="2"/>`;
  }));
  return g+'</svg></div>';
}
function network(edges,directed,drawT){
  drawT = drawT || (directed?2:4);   // umbral para DIBUJAR por defecto (el hover revela todas)
  const deg={}; Object.entries(edges).forEach(([k,v])=>{ (directed?k.split('→'):k.split('|')).forEach(p=>deg[p]=(deg[p]||0)+v); });
  const nodes=Object.keys(deg).filter(id=>STATS.P[id]&&STATS.P[id].pj>=6);
  const nodeSet=new Set(nodes);
  // SOLO las conexiones que llegan al umbral: así el hover también respeta el mínimo elegido
  const esAll=Object.entries(edges).map(([k,v])=>{ const ps=directed?k.split('→'):k.split('|'); return {a:ps[0],b:ps[1],v}; }).filter(e=>nodeSet.has(e.a)&&nodeSet.has(e.b)&&e.a!==e.b&&e.v>=drawT);
  const es=esAll;   // el layout (fuerzas) usa las mismas
  const W=840,H=600, area=W*H, k=Math.sqrt(area/Math.max(1,nodes.length))*0.62;
  const pos={}; nodes.forEach((id,i)=>{ const ang=i*2.399, rr=40+i*6; pos[id]={x:W/2+Math.cos(ang)*Math.min(rr,150),y:H/2+Math.sin(ang)*Math.min(rr,120),vx:0,vy:0}; });
  const maxDeg=Math.max(1,...nodes.map(id=>deg[id]));
  const rad=id=>10+Math.sqrt(deg[id]/maxDeg)*18;
  const GRAV=0.045; // pull to center: mantiene la nube centrada en vez de pegarse a los bordes
  for(let it=0;it<520;it++){ const cool=Math.max(0.05,1-it/520);
    for(let i=0;i<nodes.length;i++){ const A=pos[nodes[i]]; let fx=0,fy=0;
      for(let j=0;j<nodes.length;j++){ if(i===j)continue; const B=pos[nodes[j]]; let dx=A.x-B.x,dy=A.y-B.y,d=Math.hypot(dx,dy)||0.1;
        let rep=k*k/d; // Fruchterman-Reingold repulsion
        const mind=rad(nodes[i])+rad(nodes[j])+12; if(d<mind)rep+=(mind-d)*8; // collision
        fx+=dx/d*rep; fy+=dy/d*rep; }
      fx+=(W/2-A.x)*GRAV; fy+=(H/2-A.y)*GRAV; // gravedad al centro
      A.vx=(A.vx+fx)*0.86; A.vy=(A.vy+fy)*0.86; }
    es.forEach(e=>{ const A=pos[e.a],B=pos[e.b]; let dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||0.1; let f=d*d/k*0.0027*Math.min(4,e.v); A.vx+=dx/d*f;A.vy+=dy/d*f;B.vx-=dx/d*f;B.vy-=dy/d*f; });
    nodes.forEach(id=>{ const A=pos[id]; const sp=Math.hypot(A.vx,A.vy),mx=16*cool+3; if(sp>mx){A.vx*=mx/sp;A.vy*=mx/sp;} A.x+=A.vx;A.y+=A.vy; A.x=Math.max(42,Math.min(W-42,A.x));A.y=Math.max(34,Math.min(H-50,A.y)); });
  }
  const maxV=Math.max(1,...esAll.map(e=>e.v));
  let g=`<div style="overflow:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${Math.round(H*0.9)}" style="min-width:640px">`;
  if(directed)g+=`<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--muted)"/></marker></defs>`;
  esAll.forEach(e=>{ const A=pos[e.a],B=pos[e.b],w=0.8+(e.v/maxV)*12; const vis=e.v>=drawT;
    const da=`class="netedge" data-a="${e.a}" data-b="${e.b}" data-def="${vis?1:0}" style="opacity:${vis?1:0}"`;
    if(directed){ // curved so A->B and B->A don't overlap; stop at node edge
      const dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1, ux=dx/d,uy=dy/d, ra=rad(e.a)+2, rb=rad(e.b)+7;
      const ax=A.x+ux*ra, ay=A.y+uy*ra, bx=B.x-ux*rb, by=B.y-uy*rb;
      const mx=(ax+bx)/2-uy*d*0.14, my=(ay+by)/2+ux*d*0.14;
      g+=`<path ${da} d="M${ax.toFixed(1)},${ay.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="none" stroke="var(--axis)" stroke-opacity="0.6" stroke-width="${w.toFixed(1)}" marker-end="url(#arr)"/>`;
    } else g+=`<line ${da} x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}" stroke="var(--axis)" stroke-opacity="0.5" stroke-width="${w.toFixed(1)}"/>`;
  });
  nodes.forEach(id=>{ const r=rad(id),p=pos[id];
    g+=`<g class="netnode" data-p="${id}" data-tip="${nm(id)} · ${STATS.P[id].pj} PJ" style="cursor:pointer">
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${colorFor(id)}" stroke="var(--surface)" stroke-width="2.5"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y+r+12).toFixed(1)}" font-size="11.5" text-anchor="middle" fill="var(--ink)">${nm(id)}</text></g>`; });
  return g+'</svg></div>';
}

/* ---- partidos ---- */
let partSel=[];
function renderPartidos(){
  // chips
  const box=$('#partChips'); box.querySelectorAll('.pchip').forEach(e=>e.remove());
  const inp=$('#partFilterInput');
  partSel.forEach(id=>{ const c=document.createElement('span'); c.className='pchip';
    c.innerHTML=`<span class="dot" style="background:${colorFor(id)}"></span><b>${nm(id)}</b><button data-p="${id}">×</button>`;
    box.insertBefore(c,inp); c.querySelector('button').onclick=()=>{ partSel=partSel.filter(x=>x!==id); renderPartidos(); }; });
  // combos
  const cbox=$('#comboBox');
  let list=STATS.matches;
  if(partSel.length){ list=STATS.matches.filter(m=>partSel.every(p=>teamOf(m,p))); cbox.innerHTML=combosHTML(partSel,list); }
  else cbox.innerHTML='';
  // match list
  $('#partTitle').textContent=partSel.length?`Partidos con ${partSel.map(nm).join(', ')}`:'Partidos de la temporada';
  $('#partSub').textContent=partSel.length?`${list.length} partido(s) en común`:`${list.length} partidos`;
  const types=['gol','tiro','atajada','ocasion','quite'];
  $('#partList').innerHTML=list.slice().reverse().map(m=>{ const res=matchResult(m),g1=m.golesEquipo?.[1],g2=m.golesEquipo?.[2],pr=present(m);
    const w1=res===1?'win':res===2?'loss':'draw',w2=res===2?'win':res===1?'loss':'draw';
    const nmp=(arr)=>arr.map(p=>partSel.includes(p)?`<span class="selp">${p}</span>`:p).join(', ');
    return `<div class="mwrap"><div class="matchrow" data-mid="${m.id}"><div><div class="muted" style="font-size:11px">#${m.id}</div><div style="font-size:12px">${m.fecha||''}</div></div>
      <div><div class="score"><span class="${w1}">${g1??'?'}</span> <span class="muted">–</span> <span class="${w2}">${g2??'?'}</span> <span class="muted" style="font-weight:400;font-size:12px">· ${m.minutos||'?'}'</span> <span class="chev">▶</span></div>
      <div class="teams">🔵 ${nmp(m.players?.[1]||[])}<br>🟠 ${nmp(m.players?.[2]||[])}</div></div>
      <div class="cov">${types.map(t=>`<span class="cdot ${pr.has(t)?'on':''}" title="${t}"></span>`).join('')}</div></div>
      <div class="tldetail" hidden>${TIMELINES[m.id]?`<a class="tlvideo" href="${TIMELINES[m.id]}" target="_blank" rel="noopener">▶ Ver timeline con videos de YouTube</a>`:`<button class="tlvideo tlfull" data-mid="${m.id}">▶ Ver timeline completo (filtrar jugadas)</button>`}${matchResumen(m)}<div class="tlgoles"><div class="sub" style="margin:8px 4px 2px">⚽ Goles</div>${matchTimeline(m)}</div></div></div>`;
  }).join('')||'<p class="muted">No coincidieron en ningún partido.</p>';
  $$('#partList .matchrow').forEach(row=>row.onclick=()=>{ const w=row.parentElement, d=w.querySelector('.tldetail'); const op=d.hidden; d.hidden=!op; w.classList.toggle('open',op); });
  $$('#partList .tlfull').forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); openTimelineModal(b.dataset.mid); });
  $$('#partList .resrow[data-p]').forEach(r=>r.onclick=ev=>{ ev.stopPropagation(); gotoPlayer(r.dataset.p); });
}
const _teamDot=t=>`<span class="dot" style="background:${t===1?'var(--t1)':'var(--t2)'}"></span>`;
function evLabel(e){ const P=p=>p?nm(p):''; switch(e.type){
  case 'gol': return e.enContra?`⚽ Gol en contra de ${P(e.p1)}`+(e.p2?` <span class="muted">(lo forzó ${P(e.p2)})</span>`:''):`⚽ Gol de <b>${P(e.p1)}</b>`+(e.p2?` <span class="muted">(asist. ${P(e.p2)})</span>`:'');
  case 'tiro': return `Tiro de ${P(e.p1)}`+(e.p2?` <span class="muted">(pase ${P(e.p2)})</span>`:'');
  case 'atajada': return `🧤 Atajada de ${P(e.p1)}`+(e.p2?` <span class="muted">(a ${P(e.p2)})</span>`:'');
  case 'ocasion': return `Ocasión: ${P(e.p1)}${e.p2?' → '+P(e.p2):''}`;
  case 'quite': return `Quite de ${P(e.p1)}`+(e.p2?` <span class="muted">(a ${P(e.p2)})</span>`:'');
  default: return e.type; } }
function tlRows(evs){ return '<div class="tl">'+evs.map(e=>`<div class="tlrow"><span class="tlmin">${e.minuto!=null?e.minuto+"'":'–'}</span>${_teamDot(e.team)}<span class="tltxt">${evLabel(e)}</span></div>`).join('')+'</div>'; }
function sortEv(evs){ return evs.slice().sort((a,b)=>((a.minuto==null)-(b.minuto==null))||((a.minuto||0)-(b.minuto||0))||((a.id||0)-(b.id||0))); }
// timeline INLINE = solo goles
function matchTimeline(m){ const evs=sortEv((m.events||[]).filter(e=>e.type==='gol'));
  if(!evs.length)return '<p class="muted" style="padding:6px 10px;font-size:12.5px">Sin goles registrados.</p>';
  return tlRows(evs); }
// minutos ganando/empatados/perdidos (solo si todos los goles tienen minuto)
function leadMinutes(m){ const total=m.minutos; if(!total)return null;
  const all=(m.events||[]).filter(e=>e.type==='gol'); const gs=all.filter(e=>e.minuto!=null).sort((a,b)=>a.minuto-b.minuto);
  if(!gs.length||gs.length<all.length)return null;
  let s1=0,s2=0,prev=0,acc={0:0,1:0,2:0};
  for(const g of gs){ const st=s1>s2?1:s2>s1?2:0; acc[st]+=Math.max(0,g.minuto-prev); prev=g.minuto; if(g.team===1)s1++; else if(g.team===2)s2++; }
  const st=s1>s2?1:s2>s1?2:0; acc[st]+=Math.max(0,total-prev); return acc; }
// RESUMEN del partido (como el del anotador)
function matchResumen(m){
  const per={}; [1,2].forEach(t=>(m.players?.[t]||[]).forEach(p=>per[p]={g:0,a:0,t}));
  (m.events||[]).forEach(e=>{ if(e.type==='gol'){ if(!e.enContra&&e.p1&&per[e.p1])per[e.p1].g++; if(e.p2&&per[e.p2])per[e.p2].a++; } });
  const col=t=>{ const arr=Object.entries(per).filter(([p,v])=>v.t===t&&(v.g||v.a)).map(([p,v])=>({p,g:v.g,a:v.a,tot:v.g+v.a})).sort((a,b)=>b.tot-a.tot||b.g-a.g);
    const arco=(m.resumenJugadores||[]).filter(r=>r.equipo===t&&(r.minutosArco||0)>0).sort((a,b)=>b.minutosArco-a.minutosArco).map(r=>`${nm(r.jugador)} ${Math.round(r.minutosArco)}'`).join(' · ');
    const name=t===1?(m.t1||'Paredón'):(m.t2||'Canchita');
    return `<div class="rescol ${t===1?'t1':'t2'}"><div class="resh">${name}</div>`+
      (arr.length?arr.map((x,i)=>`<div class="resrow" data-p="${x.p}"><span class="resn">${i+1}. ${nm(x.p)}</span><span class="resv">${x.g} G · ${x.a} A · <b>${x.tot}</b></span></div>`).join(''):'<div class="resrow muted">Sin goles ni asistencias</div>')+
      (arco?`<div class="resarco">🧤 Al arco: ${arco}</div>`:'')+`</div>`; };
  const lm=leadMinutes(m); let chips='';
  if(lm)chips=`<div class="reschips"><span class="rchip t1">${m.t1||'Paredón'} ganó ${lm[1]}'</span><span class="rchip d">Empatados ${lm[0]}'</span><span class="rchip t2">${m.t2||'Canchita'} ganó ${lm[2]}'</span></div>`;
  return `<div class="resumen">${chips}<div class="rescols">${col(1)}${col(2)}</div></div>`;
}
// MODAL: timeline completo filtrable por tipo de jugada
function openTimelineModal(mid){ const m=MATCHES.get(String(mid)); if(!m)return;
  const order=['gol','tiro','atajada','ocasion','quite'], labels={gol:'Goles',tiro:'Tiros',atajada:'Atajadas',ocasion:'Ocasiones',quite:'Quites'};
  const present=order.filter(t=>(m.events||[]).some(e=>e.type===t)); const active=new Set(present);
  const g1=m.golesEquipo?.[1],g2=m.golesEquipo?.[2];
  const root=document.createElement('div'); root.className='modal';
  root.innerHTML=`<div class="modalbox"><div class="modalhd"><span><b>Partido #${m.id}</b> <span class="muted">· ${m.fecha||''} · ${m.t1||'Paredón'} ${g1}–${g2} ${m.t2||'Canchita'}</span></span><button class="modalx" aria-label="cerrar">✕</button></div>
    <div class="modalbody">${matchResumen(m)}<div class="fchips">${present.map(t=>`<button class="fchip on" data-t="${t}">${labels[t]}</button>`).join('')}</div><div id="modalTl">${tlRows(sortEv((m.events||[]).filter(e=>active.has(e.type))))}</div></div></div>`;
  document.body.appendChild(root); document.body.style.overflow='hidden';
  const close=()=>{ root.remove(); document.body.style.overflow=''; };
  root.querySelector('.modalx').onclick=close; root.onclick=e=>{ if(e.target===root)close(); };
  root.querySelectorAll('.fchip').forEach(b=>b.onclick=()=>{ const t=b.dataset.t; if(active.has(t)){active.delete(t);b.classList.remove('on');}else{active.add(t);b.classList.add('on');} root.querySelector('#modalTl').innerHTML=tlRows(sortEv((m.events||[]).filter(e=>active.has(e.type)))); });
  root.querySelectorAll('.resrow[data-p]').forEach(r=>r.onclick=()=>{ close(); gotoPlayer(r.dataset.p); });
}
function combosHTML(sel,list){
  if(!list.length)return '<p class="muted">Estos jugadores no coincidieron en ningún partido.</p>';
  // group by partition of sel into the two teams
  const groups={};
  list.forEach(m=>{ const g1=sel.filter(p=>teamOf(m,p)===1).sort(), g2=sel.filter(p=>teamOf(m,p)===2).sort();
    // canonical key independent of which physical team
    const parts=[g1.join('+'),g2.join('+')].sort(); const key=parts.join(' vs ');
    if(!groups[key])groups[key]={g1,g2,matches:[]}; groups[key].matches.push(m); });
  let out=`<div class="combo" style="background:var(--surface2)"><div class="cfg">Coincidieron en ${list.length} partido(s)</div><div class="hint">Desglose por cómo quedaron repartidos en los equipos:</div></div>`;
  const entries=Object.entries(groups).sort((a,b)=>b[1].matches.length-a[1].matches.length);
  entries.forEach(([key,gr])=>{
    const together=!gr.g1.length||!gr.g2.length; // all on one side
    if(together){ // shared result
      let w=0,d=0,l=0; gr.matches.forEach(m=>{ const t=teamOf(m,sel[0]),res=matchResult(m); if(res===0)d++;else if(res===t)w++;else if(res!=null)l++; });
      out+=`<div class="combo"><div class="cfg">🤝 Todos en el mismo equipo — ${gr.matches.length} partido(s)</div>
        <div class="wep"><span class="win">${w} ganados</span> · <span class="draw">${d} empatados</span> · <span class="loss">${l} perdidos</span></div></div>`;
    } else { // split: report from perspective of group containing sel[0]... use g1 group vs g2 group
      const refGroup = gr.g1.includes(sel[0])||!gr.g2.includes(sel[0])?gr.g1:gr.g2;
      const other = refGroup===gr.g1?gr.g2:gr.g1;
      let w=0,d=0,l=0; gr.matches.forEach(m=>{ const t=teamOf(m,refGroup[0]),res=matchResult(m); if(res===0)d++;else if(res===t)w++;else if(res!=null)l++; });
      out+=`<div class="combo"><div class="cfg">${refGroup.join(' + ')} <span class="muted">vs</span> ${other.join(' + ')} — ${gr.matches.length} partido(s)</div>
        <div class="wep">${refGroup.join('+')}: <span class="win">${w}G</span> · <span class="draw">${d}E</span> · <span class="loss">${l}P</span></div></div>`;
    }
  });
  return out;
}

function attachSVGHovers(){ $$('.hpt').forEach(el=>{ el.onmousemove=e=>showTT(el.dataset.tip,e.clientX,e.clientY); el.onmouseleave=hideTT; }); }
function attachNetHovers(){ const edges=$$('.netedge'), nodesEls=$$('.netnode');
  // conn incluye TODAS las conexiones (aunque no se dibujen por defecto), para revelarlas al hover
  const conn={}; edges.forEach(ed=>{ (conn[ed.dataset.a]=conn[ed.dataset.a]||new Set()).add(ed.dataset.b); (conn[ed.dataset.b]=conn[ed.dataset.b]||new Set()).add(ed.dataset.a); });
  nodesEls.forEach(el=>{ const id=el.dataset.p;
    el.onmousemove=e=>showTT(el.dataset.tip,e.clientX,e.clientY);
    el.onmouseenter=()=>{ edges.forEach(ed=>{ const on=ed.dataset.a===id||ed.dataset.b===id; ed.style.opacity=on?'1':'0.03'; }); // opacity apaga también la flecha
      nodesEls.forEach(n=>{ n.style.opacity=(n.dataset.p===id||(conn[id]&&conn[id].has(n.dataset.p)))?'1':'0.2'; }); };
    el.onmouseleave=()=>{ edges.forEach(ed=>ed.style.opacity=ed.dataset.def); nodesEls.forEach(n=>n.style.opacity=''); hideTT(); }; // restaura opacidad por defecto (1 o 0)
    el.onclick=()=>gotoPlayer(id);
  }); }

function selectTab(name){ $$('#tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===name));
  $$('.tab').forEach(s=>s.classList.toggle('tabhide',s.id!=='tab-'+name));
  if(name==='rankings')renderRank(); if(name==='quimica')renderQuim();
  if(name==='perfil'){ const id=$('#playerSel').value; if(id)renderPerfil(id); } if(name==='partidos')renderPartidos(); }

function fillPlayerSelect(){ const arr=Object.values(STATS.P).sort((a,b)=>b.pj-a.pj);
  $('#playerSel').innerHTML=arr.map(a=>`<option value="${a.id}">${nm(a.id)} (${a.pj} PJ)</option>`).join('');
  $('#playerList').innerHTML=[...PLAYERS.keys()].sort().map(id=>`<option value="${nm(id)}">`).join(''); }
function refresh(){ compute(); fillPlayerSelect(); renderTable(); const cur=$$('#tabs button').find(b=>b.getAttribute('aria-selected')==='true'); if(cur)selectTab(cur.dataset.tab); }

function resolveName(q){ q=q.trim().toLowerCase(); if(!q)return null; return [...PLAYERS.keys()].find(id=>nm(id).toLowerCase()===q)||[...PLAYERS.keys()].find(id=>nm(id).toLowerCase().startsWith(q))||[...PLAYERS.keys()].find(id=>nm(id).toLowerCase().includes(q)); }

function boot(){
  ingest(RAW,true);
  $('#seasonBadge').textContent=(RAW.meta?.torneo||'')+' '+(RAW.meta?.temporada||'')+' · '+(RAW.meta?.formato||'');
  refresh();
  $('#tabs').onclick=e=>{ const b=e.target.closest('button[data-tab]'); if(b)selectTab(b.dataset.tab); };
  $('#minPj').onchange=e=>{ minPjOnly=e.target.checked; renderTable(); };
  $('#resetTable').onclick=()=>{ sortKey=null; sortAsc=false; renderTable(); };   // vuelve al orden por Pts→G→A→win%
  $('#rankMetric').onclick=e=>{ const b=e.target.closest('button'); if(!b)return; rankKey=b.dataset.k; $$('#rankMetric button').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderRank(); };
  $('#minPj2').onchange=e=>{ rankMinPj=e.target.checked; renderRank(); };
  $('#rankAvg').onchange=e=>{ rankAvgMode=e.target.checked; renderRank(); };
  $('#playerSel').onchange=e=>renderPerfil(e.target.value);
  $('#quimMode').onclick=e=>{ const b=e.target.closest('button'); if(!b)return; quimMode=b.dataset.q; $$('#quimMode button').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderQuim(); };
  $('#themeBtn').onclick=()=>{ const cur=document.documentElement.getAttribute('data-theme'); const dark=cur?cur==='dark':matchMedia('(prefers-color-scheme:dark)').matches; document.documentElement.setAttribute('data-theme',dark?'light':'dark'); const t=$$('#tabs button').find(b=>b.getAttribute('aria-selected')==='true'); if(t)selectTab(t.dataset.tab); };
  $('#search').onkeydown=e=>{ if(e.key==='Enter'){ const id=resolveName(e.target.value); if(id){gotoPlayer(id); e.target.value='';} } };
  $('#search').onchange=e=>{ const id=resolveName(e.target.value); if(id&&[...PLAYERS.keys()].some(x=>nm(x)===e.target.value)){ gotoPlayer(id); e.target.value=''; } };
  const pf=$('#partFilterInput');
  const addPart=()=>{ const id=resolveName(pf.value); if(id&&!partSel.includes(id)){ partSel.push(id); pf.value=''; renderPartidos(); } };
  pf.onkeydown=e=>{ if(e.key==='Enter'){e.preventDefault(); addPart();} };
  pf.onchange=()=>{ if([...PLAYERS.keys()].some(x=>nm(x)===pf.value)) addPart(); };
  $('#loadBtn').onclick=()=>$('#fileInput').click();
  $('#fileInput').onchange=e=>loadFiles([...e.target.files]);
  document.addEventListener('dragover',e=>e.preventDefault());
  document.addEventListener('drop',e=>{ e.preventDefault(); if(e.dataTransfer.files.length)loadFiles([...e.dataTransfer.files]); });
  ['scroll','touchstart'].forEach(ev=>document.addEventListener(ev,hideTT,{passive:true}));  // por las dudas: cerrar tooltip al scrollear/tocar
  loadRemote();   // si está hosteado (GitHub Pages), trae los datos frescos de /data; si es archivo local, usa los embebidos
}
// Carga de datos remotos: manifest -> jugadores + cada partido. Silencioso si falla (uso local).
async function loadRemote(){
  try{
    const base='data/';
    const mf=await fetch(base+'manifest.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject('no manifest'));
    if(mf.jugadores){ const j=await fetch(base+mf.jugadores,{cache:'no-store'}).then(r=>r.json()); ingest({jugadores:j.jugadores||j},true); }
    const files=mf.partidos||[];
    const objs=await Promise.all(files.map(f=>fetch(base+f,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)));
    let n=0; objs.forEach(o=>{ if(o){ ingestMatch(o,true); n++; } });
    if(n){ refresh(); }
  }catch(e){ /* archivo local o sin conexión: quedan los datos embebidos */ }
}
function loadFiles(files){ let n=0;
  Promise.all(files.map(f=>f.text().then(txt=>{ try{ const j=JSON.parse(txt); if(j.partidos){ingest(j,true);n+=j.partidos.length;} else if(j.events||j.players){ingestMatch(j,true);n++;} }catch(err){ console.warn('json inválido',f.name,err); } }))).then(()=>{ refresh(); alert(n+' partido(s) cargado(s)/actualizado(s). Total: '+MATCHES.size+' partidos.'); });
}
boot();