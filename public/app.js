(()=>{
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>{t=Math.max(0,Math.floor(t||0));return`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`};
const PLACEHOLDER='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><defs><linearGradient id="g"><stop stop-color="#4c1d95"/><stop offset="1" stop-color="#a21caf"/></linearGradient></defs><rect width="16" height="9" fill="url(#g)"/><text x="8" y="6" font-size="4" text-anchor="middle" fill="#fff9">♪</text></svg>');
const api=async(u,o={})=>{const{json,...rest}=o;const r=await fetch(u,{credentials:'same-origin',...rest,headers:{'X-Requested-With':'karaoke',...(json?{'Content-Type':'application/json'}:{})},body:json?JSON.stringify(json):rest.body});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d};
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(msg,type='ok'){const t=document.createElement('div');t.className='toast '+type;t.textContent=(type==='ok'?'✓ ':'⚠ ')+msg;$('#toasts').append(t);setTimeout(()=>t.remove(),4500)}
let me=null,cur=null,q='',genre='',page=1,pages=1,loading=false,seq=0,editing=null;
const isAdmin=()=>me&&me.role==='admin';

/* ---------- account ---------- */
function renderAccount(){
  const a=$('#account');a.innerHTML='';
  if(isAdmin()){const b=document.createElement('button');b.className='primary';b.id='addBtn';b.textContent='+ Add Video';b.onclick=()=>openSong();a.append(b)}
  if(me){a.insertAdjacentHTML('beforeend',`<span class="chip"><span aria-hidden="true">👤</span><span class="nm">${esc(me.username)}</span>${isAdmin()?'<span class="badge">Admin</span>':''}</span><button class="ghost" id="out">Sign out</button>`);
    $('#out').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});me=null;renderAccount();renderInfo();toast('Signed out')}}
  else{a.insertAdjacentHTML('beforeend','<button class="ghost" id="in">Sign in</button>');$('#in').onclick=()=>openAuth()}
}
let reg=false;
function openAuth(r=false){reg=r;$('#authTitle').textContent=r?'Create account':'Sign in';$('#authSwitch').textContent=r?'I have an account':'Create account';$('#authErr').textContent='';$('#authDlg').showModal()}
$('#authSwitch').onclick=()=>openAuth(!reg);
$('#authForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
  try{me=await api(`/api/auth/${reg?'register':'login'}`,{method:'POST',json:f});$('#authDlg').close();e.target.reset();renderAccount();renderInfo();toast(`Welcome, ${me.username}!`)}catch(x){$('#authErr').textContent=x.message}};
document.addEventListener('click',e=>{if(e.target.matches('[data-close]'))e.target.closest('dialog').close()});

/* ---------- list / search / infinite scroll ---------- */
const list=$('#list');
const skeleton=n=>Array.from({length:n},()=>'<li class="sk" aria-hidden="true"><div class="sk-img"></div><div><i style="width:80%"></i><i style="width:50%"></i></div></li>').join('');
const item=s=>`<li><button class="rec${cur&&cur.id===s.id?' active':''}" data-id="${s.id}" ${cur&&cur.id===s.id?'aria-current="true"':''} aria-label="Play ${esc(s.title)} by ${esc(s.artist)}">
<img loading="lazy" decoding="async" width="96" height="64" src="${esc(s.thumb||PLACEHOLDER)}" alt="Cover art for ${esc(s.title)}">
<span class="meta"><b>${esc(s.title)}</b><small>${esc(s.artist)}</small><em>${cur&&cur.id===s.id?'♪ Now playing':'▶ Play'}${s.duration?' · '+fmt(s.duration):''}</em></span></button></li>`;
list.addEventListener('load',e=>e.target.classList.add('loaded'),true);
list.addEventListener('error',e=>{if(e.target.tagName==='IMG'){e.target.src=PLACEHOLDER}},true);
list.addEventListener('click',e=>{const b=e.target.closest('.rec');if(!b)return;const s=songs.get(b.dataset.id);s&&select(s,true)});
const songs=new Map();
async function load(reset){
  if(loading||(!reset&&page>pages))return;loading=true;const my=++seq;
  if(reset){page=1;list.innerHTML=skeleton(6);$('#empty').hidden=true;$('#recTitle').textContent=q||genre?'Results':'Recommended Songs'}
  else list.insertAdjacentHTML('beforeend',skeleton(2));
  try{
    const d=await api(`/api/songs?${new URLSearchParams({q,genre,page,limit:10,...(!q&&!genre&&cur&&false?{exclude:cur.id}:{})})}`);
    if(my!==seq)return;list.querySelectorAll('.sk').forEach(n=>n.remove());
    pages=d.pages;page++;if(reset)list.innerHTML='';
    d.items.forEach(s=>songs.set(s.id,s));list.insertAdjacentHTML('beforeend',d.items.map(item).join(''));
    if(reset){renderGenres(d.genres);$('#genreList').innerHTML=d.genres.map(g=>`<option value="${esc(g)}">`).join('');
      if(!d.total){const em=$('#empty');em.hidden=false;em.innerHTML=q||genre?`<b>No songs found</b>Nothing matches “${esc(q||genre)}”. Try another title, artist or genre.`:`<b>No songs yet</b>${isAdmin()?'Use “+ Add Video” to publish the first one.':'Check back soon!'}`}
      if(!cur&&d.items[0])select(d.items[0],false);if(!d.total&&!q&&!genre){cur=null;renderInfo();setVideo(null)}}
  }catch(x){if(my===seq){list.innerHTML='';const em=$('#empty');em.hidden=false;em.innerHTML=`<b>Couldn't load songs</b>${esc(x.message)}<br><button class="ghost" id="retry">Try again</button>`;$('#retry').onclick=()=>load(true)}}
  finally{if(my===seq)loading=false}
}
function renderGenres(gs){const c=$('#genres');c.innerHTML=gs.length?['All',...gs].map(g=>`<button type="button" aria-pressed="${(g==='All'&&!genre)||g===genre}" data-g="${g==='All'?'':esc(g)}">${esc(g)}</button>`).join(''):''}
$('#genres').onclick=e=>{const b=e.target.closest('button');if(b){genre=b.dataset.g;load(true)}};
new IntersectionObserver(es=>{if(es[0].isIntersecting&&!loading&&songs.size)load(false)},{rootMargin:'300px'}).observe($('#sentinel'));

/* search + suggestions */
const qi=$('#q'),sg=$('#sugg');let dt;
qi.oninput=()=>{clearTimeout(dt);$('#clear').hidden=!qi.value;dt=setTimeout(async()=>{q=qi.value.trim();load(true);
  if(!q){sg.hidden=true;return}try{const r=await api('/api/suggest?q='+encodeURIComponent(q));
    sg.innerHTML=r.map(t=>`<li role="option"><button type="button">${esc(t)}</button></li>`).join('');sg.hidden=!r.length}catch{}},250)};
sg.onclick=e=>{const b=e.target.closest('button');if(b){qi.value=q=b.textContent;sg.hidden=true;$('#clear').hidden=false;load(true)}};
qi.onkeydown=e=>{if(e.key==='ArrowDown'&&!sg.hidden){e.preventDefault();sg.querySelector('button')?.focus()}if(e.key==='Escape')sg.hidden=true};
sg.onkeydown=e=>{const bs=[...sg.querySelectorAll('button')],i=bs.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();bs[Math.min(i+1,bs.length-1)].focus()}if(e.key==='ArrowUp'){e.preventDefault();(bs[i-1]||qi).focus()}if(e.key==='Escape'){sg.hidden=true;qi.focus()}};
$('#clear').onclick=()=>{qi.value=q='';$('#clear').hidden=true;sg.hidden=true;qi.focus();load(true)};
$('#searchForm').onsubmit=e=>{e.preventDefault();sg.hidden=true;q=qi.value.trim();load(true)};
document.addEventListener('click',e=>{if(!e.target.closest('.search'))sg.hidden=true});

/* ---------- player ---------- */
const v=$('#video'),P=$('#player');
function setVideo(s){ // video src is only set when a song is actually played
  v.pause();v.removeAttribute('src');v.querySelectorAll('track').forEach(t=>t.remove());v.load();$('#vErr').hidden=true;P.classList.remove('playing');
  P.style.backgroundImage=s&&s.thumb?`url("${s.thumb}")`:'';$('#cc').hidden=!(s&&s.captions);$('#cc').setAttribute('aria-pressed','false');v.poster=s?.thumb||'';
}
function ensureSrc(){if(!cur||v.getAttribute('src'))return;v.src=cur.video;if(cur.captions){const t=document.createElement('track');t.kind='captions';t.label='Captions';t.srclang='en';t.src=cur.captions;v.append(t);t.track.mode='disabled'}v.load()}
function select(s,play){
  const go=()=>{cur=s;setVideo(s);renderInfo();document.title=`${s.title} – ${s.artist} · Starlight Karaoke`;
    list.querySelectorAll('.rec').forEach(b=>{const on=b.dataset.id===s.id;b.classList.toggle('active',on);on?b.setAttribute('aria-current','true'):b.removeAttribute('aria-current');b.querySelector('em').textContent=(on?'♪ Now playing':'▶ Play')+(songs.get(b.dataset.id).duration?' · '+fmt(songs.get(b.dataset.id).duration):'')});
    if(play){ensureSrc();v.play().catch(()=>{});if(matchMedia('(max-width:1000px)').matches)P.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'})}
    P.classList.remove('swap')};
  if(cur&&!reduce){P.classList.add('swap');setTimeout(go,220)}else go();
}
function renderInfo(){
  const el=$('#info');
  if(!cur){el.innerHTML='<h1>Welcome to Starlight Karaoke</h1><p class="by">Pick a song to start singing.</p>';return}
  el.innerHTML=`<h1>${esc(cur.title)}</h1><p class="by">${esc(cur.artist)}</p><span class="tag">${esc(cur.genre)}</span>${cur.duration?` <span class="tag">${fmt(cur.duration)}</span>`:''}${cur.description?`<p>${esc(cur.description)}</p>`:''}`;
  if(isAdmin()){const r=document.createElement('div');r.className='adminrow';r.innerHTML='<button class="ghost" id="edit">✎ Edit</button><button class="ghost" id="del">🗑 Delete</button>';el.append(r);
    $('#edit').onclick=()=>openSong(cur);$('#del').onclick=confirmDelete}
}
const toggle=()=>{ensureSrc();v.paused?v.play().catch(()=>{}):v.pause()};
$('#bigPlay').onclick=$('#pp').onclick=toggle;v.onclick=toggle;
v.onplay=()=>{P.classList.add('playing');$('#pp').textContent='⏸';$('#pp').setAttribute('aria-label','Pause');$('#bigPlay').setAttribute('aria-label','Pause')};
v.onpause=()=>{P.classList.remove('playing');$('#pp').textContent='▶';$('#pp').setAttribute('aria-label','Play');$('#bigPlay').setAttribute('aria-label','Play')};
v.ontimeupdate=v.onloadedmetadata=()=>{if(v.duration){$('#seek').value=v.currentTime/v.duration*1000;$('#time').textContent=`${fmt(v.currentTime)} / ${fmt(v.duration)}`}};
$('#seek').oninput=e=>{if(v.duration)v.currentTime=e.target.value/1000*v.duration};
$('#vol').oninput=e=>{v.volume=+e.target.value;v.muted=false};
v.onvolumechange=()=>{const m=v.muted||v.volume===0;$('#mute').textContent=m?'🔇':'🔊';$('#mute').setAttribute('aria-label',m?'Unmute':'Mute')};
$('#mute').onclick=()=>v.muted=!v.muted;
$('#fs').onclick=()=>document.fullscreenElement?document.exitFullscreen():P.requestFullscreen?.();
$('#cc').onclick=e=>{const t=v.textTracks[0];if(!t)return;const on=t.mode!=='showing';t.mode=on?'showing':'disabled';e.currentTarget.setAttribute('aria-pressed',on)};
v.onerror=()=>{if(v.getAttribute('src')){$('#vErr').hidden=false;toast('Video failed to load','bad')}};
v.onended=()=>{const b=list.querySelector('.rec.active')?.closest('li')?.nextElementSibling?.querySelector('.rec');b&&b.click()};

/* ---------- admin: add / edit / delete ---------- */
const sf=$('#songForm'),MAXV=500*1024*1024,MAXI=5*1024*1024;let urls=[];
function openSong(s=null){
  if(!isAdmin())return;editing=s;sf.reset();urls.forEach(URL.revokeObjectURL);urls=[];
  $('#songTitleH').textContent=s?'Edit Song':'Add Video';$('#saveBtn').textContent=s?'Save Changes':'Save & Publish';$('#songErr').textContent='';$('#prog').hidden=true;
  $('#thumbPrev').hidden=!(s&&s.thumb);$('#thumbPrev').src=s?.thumb||'';$('#vidPrev').hidden=true;$('#vidPrev').removeAttribute('src');
  if(s)for(const k of['title','artist','genre','description'])sf.elements[k].value=s[k]||'';
  $('#songDlg').showModal();
}
const prev=(inp,el,max,types,label)=>{const f=inp.files[0];if(!f)return;const ext=f.name.split('.').pop().toLowerCase();
  if(!types.includes(ext)||f.size>max){inp.value='';el.hidden=true;$('#songErr').textContent=`${label}: allowed ${types.join(', ').toUpperCase()}, max ${Math.round(max/1048576)} MB`;return}
  $('#songErr').textContent='';const u=URL.createObjectURL(f);urls.push(u);el.src=u;el.hidden=false};
$('#thumbIn').onchange=e=>prev(e.target,$('#thumbPrev'),MAXI,['jpg','jpeg','png','webp'],'Thumbnail');
$('#videoIn').onchange=e=>{prev(e.target,$('#vidPrev'),MAXV,['mp4','webm','ogv'],'Video');$('#vidPrev').onloadedmetadata=()=>sf.elements.duration.value=Math.round($('#vidPrev').duration)};
sf.onsubmit=e=>{e.preventDefault();const err=$('#songErr');
  for(const k of['title','artist','genre'])if(!sf.elements[k].value.trim()){err.textContent='Please fill in all required fields.';sf.elements[k].focus();return}
  if(!editing&&!sf.elements.video.files[0]){err.textContent='Please choose a karaoke video.';return}
  const fd=new FormData(sf);for(const k of['video','thumb','captions'])if(!fd.get(k)?.size)fd.delete(k);
  const x=new XMLHttpRequest();x.open(editing?'PUT':'POST',editing?`/api/songs/${editing.id}`:'/api/songs');x.setRequestHeader('X-Requested-With','karaoke');
  $('#prog').hidden=false;$('#saveBtn').disabled=true;err.textContent='';
  x.upload.onprogress=ev=>{if(ev.lengthComputable){const p=Math.round(ev.loaded/ev.total*100);$('#bar').style.width=p+'%';$('#pct').textContent=p+'%'}};
  x.onload=()=>{$('#saveBtn').disabled=false;let d={};try{d=JSON.parse(x.responseText)}catch{}
    if(x.status<300){$('#songDlg').close();toast(editing?'Song updated':'Song published');songs.clear();cur=null;load(true).then?.(()=>{});setTimeout(()=>{const s=songs.get(d.id);s&&select(s,false)},600)}
    else{err.textContent=d.error||'Upload failed';toast(d.error||'Upload failed','bad')}};
  x.onerror=()=>{$('#saveBtn').disabled=false;err.textContent='Network error. Please try again.';toast('Network error','bad')};
  x.send(fd);
};
function confirmDelete(){if(!cur)return;$('#delText').textContent=`“${cur.title}” by ${cur.artist} will be permanently removed.`;const d=$('#delDlg');
  d.onclose=async()=>{if(d.returnValue!=='yes')return;d.returnValue='';try{await api(`/api/songs/${cur.id}`,{method:'DELETE'});toast('Song deleted');songs.clear();cur=null;setVideo(null);renderInfo();load(true)}catch(x){toast(x.message,'bad')}};d.showModal()}

/* ---------- init ---------- */
(async()=>{try{me=(await api('/api/me')).user}catch{}renderAccount();renderInfo();load(true)})();
})();

