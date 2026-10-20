const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let html=read('src/layout.html').replace('/* STYLES */',()=>read('src/styles.css')).replace('/* PHYSICS */',()=>read('src/physics.js')).replace('/* APP */',()=>read('src/app.js'));
if(/\/\* (STYLES|PHYSICS|APP) \*\//.test(html))throw Error('Unresolved build marker');
fs.writeFileSync(path.join(root,'index.html'),html);
console.log('Built standalone index.html ('+Buffer.byteLength(html)+' bytes)');
