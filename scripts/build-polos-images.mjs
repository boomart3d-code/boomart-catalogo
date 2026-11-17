// Derivados de catálogo, sin recortar ni sobrescribir los originales.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
let sharp;try{sharp=createRequire(import.meta.url)('sharp');}catch{sharp=createRequire('D:/CODIGOS BOOMART APP/package.json')('sharp');}
const data=JSON.parse(await readFile(path.join(root,'polos/data/polos.json'),'utf8'));
const manifest={};let created=0;
await mkdir(path.join(root,'polos/img/responsive'),{recursive:true});
for(const file of new Set(data.productos.flatMap(p=>p.fotos.map(f=>f.archivo)))){
  const source=path.resolve(root,'polos',file);
  if(!source.startsWith(path.join(root,'polos')+path.sep))throw new Error('Imagen fuera de Polos');
  const bytes=await readFile(source), hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
  const info=await sharp(bytes).metadata();const variants=[];
  for(const width of [180,360,720].filter(w=>w<info.width)){
    const out=`img/responsive/${hash}-${width}w.webp`;
    if(!await stat(path.join(root,'polos',out)).catch(()=>null)){await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality:82}).toFile(path.join(root,'polos',out));created++;}
    variants.push([width,out]);
  }
  manifest[file]=variants;
}
await writeFile(path.join(root,'polos/data/imagenes.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(root,'polos/imagenes.js'),'/* Generado: build-polos-images.mjs. */\nwindow.BOOMART_POLOS_IMAGES='+JSON.stringify(manifest)+';\n');
console.log(JSON.stringify({originales:Object.keys(manifest).length,derivadosCreados:created}));
