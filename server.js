const express=require('express'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),multer=require('multer'),rateLimit=require('express-rate-limit');
const PORT=process.env.PORT||3000,DATA=path.join(__dirname,'data'),UP=path.join(__dirname,'uploads');
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(UP,{recursive:true});
const DBF=path.join(DATA,'db.json'),SF=path.join(DATA,'.secret');
if(!process.env.JWT_SECRET&&!fs.existsSync(SF))fs.writeFileSync(SF,crypto.randomBytes(48).toString('hex'),{mode:0o600});
const SECRET=process.env.JWT_SECRET||fs.readFileSync(SF,'utf8');
const db=fs.existsSync(DBF)?JSON.parse(fs.readFileSync(DBF,'utf8')):{users:[],songs:[]};
const save=()=>{fs.writeFileSync(DBF+'.tmp',JSON.stringify(db,null,2));fs.renameSync(DBF+'.tmp',DBF)};
if(!db.users.some(u=>u.role==='admin')){
  const pw=process.env.ADMIN_PASSWORD||crypto.randomBytes(9).toString('base64url'),name=process.env.ADMIN_USER||'admin';
  db.users.push({id:crypto.randomUUID(),username:name,hash:bcrypt.hashSync(pw,12),role:'admin'});save();
  console.log(`\n  Admin created -> username: ${name}  password: ${pw}\n  (change via ADMIN_USER / ADMIN_PASSWORD env vars before first run)\n`);
}
const app=express();app.disable('x-powered-by');
app.use((q,s,n)=>{s.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'});n()});
app.use(express.json({limit:'50kb'}));
const cookie=(r,n)=>((r.headers.cookie||'').split(';').map(s=>s.trim().split('=')).find(p=>p[0]===n)||[])[1];
app.use((req,res,next)=>{ // authenticate; role is always re-read from the DB
  try{const p=jwt.verify(cookie(req,'token')||'',SECRET);req.user=db.users.find(u=>u.id===p.id)||null}catch{req.user=null}
  if(!['GET','HEAD'].includes(req.method)&&req.get('X-Requested-With')!=='karaoke')return res.status(403).json({error:'Forbidden'});
  next();
});
const admin=(req,res,next)=>!req.user?res.status(401).json({error:'Please sign in'}):req.user.role!=='admin'?res.status(403).json({error:'Admin access required'}):next();
const pub=u=>u&&{username:u.username,role:u.role};
const setTok=(res,u)=>res.cookie('token',jwt.sign({id:u.id},SECRET,{expiresIn:'7d'}),{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:6048e5});
const authLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false});
app.post('/api/auth/register',authLimit,(req,res)=>{
  const{username,password}=req.body||{};
  if(!/^[\w.-]{3,24}$/.test(username||''))return res.status(400).json({error:'Username: 3-24 letters, numbers, . _ -'});
  if(typeof password!=='string'||password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});
  if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:'Username already taken'});
  const u={id:crypto.randomUUID(),username,hash:bcrypt.hashSync(password,12),role:'user'}; // role is never client-controlled
  db.users.push(u);save();setTok(res,u);res.json(pub(u));
});
app.post('/api/auth/login',authLimit,(req,res)=>{
  const{username,password}=req.body||{};const u=db.users.find(x=>x.username.toLowerCase()===String(username||'').toLowerCase());
  if(!u||!bcrypt.compareSync(String(password||''),u.hash))return res.status(401).json({error:'Invalid username or password'});
  setTok(res,u);res.json(pub(u));
});
app.post('/api/auth/logout',(q,res)=>{res.clearCookie('token');res.json({ok:true})});
app.get('/api/me',(req,res)=>res.json({user:pub(req.user)}));

app.get('/api/songs',(req,res)=>{
  const q=String(req.query.q||'').toLowerCase().trim(),g=String(req.query.genre||'').toLowerCase(),exclude=req.query.exclude;
  const page=Math.max(1,+req.query.page||1),limit=Math.min(30,Math.max(1,+req.query.limit||10));
  let l=db.songs.filter(s=>(!q||[s.title,s.artist,s.genre].some(x=>x.toLowerCase().includes(q)))&&(!g||s.genre.toLowerCase()===g)&&s.id!==exclude)
    .sort((a,b)=>b.createdAt-a.createdAt);
  res.json({items:l.slice((page-1)*limit,page*limit),total:l.length,pages:Math.ceil(l.length/limit)||1,genres:[...new Set(db.songs.map(s=>s.genre))].sort()});
});
app.get('/api/suggest',(req,res)=>{
  const q=String(req.query.q||'').toLowerCase().trim();if(!q)return res.json([]);
  const set=new Set();db.songs.forEach(s=>[s.title,s.artist,s.genre].forEach(x=>x.toLowerCase().includes(q)&&set.add(x)));res.json([...set].slice(0,6));
});
app.get('/api/songs/:id',(req,res)=>{const s=db.songs.find(x=>x.id===req.params.id);s?res.json(s):res.status(404).json({error:'Not found'})});

const VID={'.mp4':'video/mp4','.webm':'video/webm','.ogv':'video/ogg'},IMG={'.jpg':1,'.jpeg':1,'.png':1,'.webp':1};
const upload=multer({
  storage:multer.diskStorage({destination:UP,filename:(q,f,cb)=>cb(null,crypto.randomBytes(16).toString('hex')+path.extname(f.originalname).toLowerCase())}),
  limits:{fileSize:500*1024*1024,files:3},
  fileFilter:(q,f,cb)=>{const e=path.extname(f.originalname).toLowerCase();
    const ok=f.fieldname==='video'?VID[e]&&f.mimetype.startsWith('video/'):f.fieldname==='thumb'?IMG[e]&&f.mimetype.startsWith('image/'):f.fieldname==='captions'?e==='.vtt':false;
    ok?cb(null,true):cb(new Error(`Invalid file for "${f.fieldname}"`))}
}).fields([{name:'video',maxCount:1},{name:'thumb',maxCount:1},{name:'captions',maxCount:1}]);
const rm=f=>f&&fs.unlink(path.join(UP,path.basename(f)),()=>{});
const clean=b=>({title:String(b.title||'').trim().slice(0,120),artist:String(b.artist||'').trim().slice(0,120),genre:String(b.genre||'').trim().slice(0,40),description:String(b.description||'').trim().slice(0,1000),duration:Math.max(0,Math.round(+b.duration||0))});
const fileUrl=f=>f&&'/uploads/'+f.filename;
// admin check runs BEFORE multer so unauthorised requests never write a byte to disk
app.post('/api/songs',admin,upload,(req,res)=>{
  const F=req.files||{},d=clean(req.body),discard=()=>Object.values(F).flat().forEach(f=>rm(f.filename));
  if(!d.title||!d.artist||!d.genre||!F.video){discard();return res.status(400).json({error:'Title, artist, genre and a video are required'})}
  const s={id:crypto.randomUUID(),...d,video:fileUrl(F.video[0]),thumb:fileUrl(F.thumb&&F.thumb[0]),captions:fileUrl(F.captions&&F.captions[0]),createdAt:Date.now()};
  db.songs.push(s);save();res.status(201).json(s);
});
app.put('/api/songs/:id',admin,upload,(req,res)=>{
  const F=req.files||{},s=db.songs.find(x=>x.id===req.params.id);
  if(!s){Object.values(F).flat().forEach(f=>rm(f.filename));return res.status(404).json({error:'Not found'})}
  const d=clean(req.body);if(!d.title||!d.artist||!d.genre){Object.values(F).flat().forEach(f=>rm(f.filename));return res.status(400).json({error:'Title, artist and genre are required'})}
  Object.assign(s,d,{duration:d.duration||s.duration});
  for(const k of['video','thumb','captions'])if(F[k]){rm(s[k]);s[k]=fileUrl(F[k][0])}
  save();res.json(s);
});
app.delete('/api/songs/:id',admin,(req,res)=>{
  const i=db.songs.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Not found'});
  const[s]=db.songs.splice(i,1);[s.video,s.thumb,s.captions].forEach(rm);save();res.json({ok:true});
});
app.use('/uploads',express.static(UP,{maxAge:'7d',index:false,dotfiles:'deny'})); // supports HTTP Range for seeking
app.use(express.static(path.join(__dirname,'public')));
app.use('/api',(q,res)=>res.status(404).json({error:'Not found'}));
app.use((err,q,res,n)=>res.status(err instanceof multer.MulterError||/Invalid file/.test(err.message)?400:500).json({error:err.code==='LIMIT_FILE_SIZE'?'File too large (max 500 MB)':err.message}));
app.listen(PORT,()=>console.log(`Karaoke running at http://localhost:${PORT}`));
