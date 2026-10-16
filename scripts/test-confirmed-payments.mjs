import {test} from "node:test";
import assert from "node:assert/strict";
import {moneyCents, validatePayment} from "../panel/clientes/payments-model.mjs";
import {purchasePayload, deliverPurchase} from "../supabase/functions/meta-purchase/purchase.mjs";

const valid = {pedido:"NV-2026-00125", productos:[{id:"templo-aries",quantity:"2",item_price:"100,50"}],
  abonado:"50,00",medio:"yape",referencia:"OP123456",verified:true};
const ids = new Set(["templo-aries"]);
const order = {id:"ea34cc93-5fe5-4cbc-aa39-f1a347c71ffe",pedido:"NV202600125",productos:[{id:"templo-aries",quantity:2,item_price:100.5}],
  total:"201.00",abonado:"50.00",confirmado_en:"2026-10-16T16:00:00Z",email_hash:"a".repeat(64),phone_hash:"b".repeat(64),lease:"lease-1"};

test("montos exactos sin redondear entradas inválidas", () => {
  assert.equal(moneyCents("100,50"),10050);
  assert.equal(moneyCents("0.10"),10);
  for (const input of ["", "-1", "1.001", "1,500.00", "1e2", "NaN", "Infinity", "1000000"]) {
    assert.throws(() => moneyCents(input));
  }
});
test("abono parcial y total del pedido se mantienen separados", () => {
  const result = validatePayment(valid,ids);
  assert.equal(result.p_abonado,50);
  assert.equal(result.p_productos[0].item_price,100.5);
  for (const change of [{verified:false},{abonado:"202"},{abonado:"0"},{medio:"inventado"},{referencia:""},
    {productos:[{...valid.productos[0],quantity:"1.5"}]},{productos:[{...valid.productos[0],id:"no-existe"}]},
    {productos:[...valid.productos,...valid.productos]}]) {
    assert.throws(() => validatePayment({...valid,...change},ids));
  }
});
test("Purchase lleva total, ID estable, identificadores de catálogo y hashes; sin datos del operador", () => {
  const payload = purchasePayload(order).data[0];
  assert.equal(payload.event_name,"Purchase");
  assert.equal(payload.event_time,1792166400);
  assert.equal(payload.custom_data.value,201);
  assert.equal(payload.custom_data.currency,"PEN");
  assert.equal(payload.custom_data.num_items,2);
  assert.deepEqual(payload.custom_data.content_ids,["templo-aries"]);
  assert.equal(payload.action_source,"chat");
  assert.equal(payload.event_id,purchasePayload({...order,lease:"otro"}).data[0].event_id);
  assert.deepEqual(Object.keys(payload.user_data).sort(),["em","ph"]);
  assert.equal(JSON.stringify(payload).includes("50.00"),false);
});

function fakeDb() {
  let claimed = false;
  const calls = [];
  return {calls, async rpc(name,args) {
    calls.push({name,args});
    if (name === "meta_compra_tomar") {
      if (claimed) return {data:[],error:null};
      claimed = true; return {data:[order],error:null};
    }
    return {data:true,error:null};
  }};
}
test("sin credencial privada no toma la compra ni llama a Meta", async () => {
  const db = fakeDb();
  assert.deepEqual(await deliverPurchase({db,id:order.id,token:null,version:"v25.0",fetcher:()=>assert.fail()}),{status:"sin_configurar"});
  assert.equal(db.calls.length,0);
});
test("dos envíos concurrentes producen un solo POST", async () => {
  const db = fakeDb(); let sent = 0;
  const send = () => deliverPurchase({db,id:order.id,token:"test-token",version:"v25.0",fetcher:async (url,options) => {
    sent++; assert.equal(options.headers.Authorization,"Bearer test-token");
    assert.equal(url.includes("test-token"),false);
    assert.deepEqual(JSON.parse(options.body),purchasePayload(order));
    return {ok:true,status:200,json:async()=>({events_received:1})};
  }});
  const results = await Promise.all([send(),send()]);
  assert.equal(sent,1);
  assert.deepEqual(results.map(r=>r.status).sort(),["enviado","sin_cambios"]);
  assert.equal(db.calls.at(-1).args.p_ok,true);
});
test("rechazo o fallo de red queda reintentable sin guardar secretos", async () => {
  for (const fetcher of [async()=>{throw new Error("test-token");},async()=>({ok:false,status:400,json:async()=>({error:{code:100,message:"sensitive"}})}),
    async()=>({ok:true,status:200,json:async()=>({events_received:0})})]) {
    const db = fakeDb();
    assert.deepEqual(await deliverPurchase({db,id:order.id,token:"test-token",version:"v25.0",fetcher}),{status:"error"});
    assert.equal(db.calls.at(-1).args.p_ok,false);
    assert.equal(JSON.stringify(db.calls).includes("test-token"),false);
    assert.equal(JSON.stringify(db.calls).includes("sensitive"),false);
  }
});
test("fallo al guardar acuse no se anuncia como enviado", async () => {
  const db = fakeDb(); const base = db.rpc.bind(db);
  db.rpc = async (name,args) => name === "meta_compra_resultado" ? {data:false,error:null} : base(name,args);
  await assert.rejects(deliverPurchase({db,id:order.id,token:"test",version:"v25.0",fetcher:async()=>({ok:true,status:200,json:async()=>({events_received:1})})}));
});
