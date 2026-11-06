const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./catalogo-core.js');
const productos=[{id:'a',nombre:'León',tema:'Harry Potter',color:'blanco',precio:null},{id:'b',nombre:'Slytherin',tema:'Harry Potter',color:'negro',precio:null}];
test('precio pendiente no se transforma en cero ni en precio confirmado',()=>{for(const precio of [null,0,'129',NaN,Infinity]) assert.equal(C.precioConfirmado({precio}),false);assert.equal(C.precioConfirmado({precio:129}),true)});
test('busqueda ignora mayusculas y acentos y combina filtros',()=>{assert.equal(C.filtrar(productos,{busqueda:'LEON',color:'blanco'})[0].id,'a');assert.equal(C.filtrar(productos,{busqueda:'LEON',color:'negro'}).length,0)});
test('ordenar no modifica el catalogo fuente',()=>{C.filtrar(productos,{orden:'nombre'});assert.deepEqual(productos.map(p=>p.id),['a','b'])});
test('una seleccion comercial siempre identifica corte color talla y diseno',()=>{const v=C.variante(productos[1],'mujer','L');assert.equal(v.clave,'b|mujer|negro|L');assert.match(C.mensaje(v),/Mujer.*negro.*L/);assert.throws(()=>C.variante(productos[1],'todos','M'));assert.throws(()=>C.variante(productos[1],'hombre','XL'))});
