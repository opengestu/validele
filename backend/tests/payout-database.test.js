// Isolated PostgreSQL engine. Never connects to Supabase or Pixpay.
// npm --prefix backend ci --include=dev; npm --prefix backend run test:payout
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PAYOUT_TEST_ENGINE || '@electric-sql/pglite');
const { createPayoutService } = require('../payout-service');
const vendor = '00000000-0000-4000-8000-000000000001';
const vendor2 = '00000000-0000-4000-8000-000000000002';
const order = '00000000-0000-4000-8000-000000000003';
const order2 = '00000000-0000-4000-8000-000000000004';
let db;
async function scalar(sql, args = []) { const result = await db.query(sql, args); return Object.values(result.rows[0])[0]; }
async function batch(source = 'manual', rate = 2, id = null) { return scalar('select create_controlled_payout_batch($1,$2,null,$3,null,null)', [id, rate, source]); }
async function claim(id, vendorId = vendor, auto = false) { return scalar('select claim_payout_dispatch($1,$2,$3,null)', [id,vendorId,auto]); }
async function settle(id, tx, state) { return scalar("select settle_payout_dispatch($1,$2,$3,'{}')", [id,tx,state]); }
async function collection(id, vendorProvider='pixpay') {
  await db.query("insert into payment_transactions(transaction_id,order_id,amount,status,transaction_type,provider) select $1,id,total_amount,'SUCCESSFUL','payment',$2 from orders where id=$3",['collect-'+id,vendorProvider,id]);
}
async function seedSecondOrder() { await db.query("insert into orders(id,vendor_id,status,total_amount,protection_fee,payout_status,payment_confirmed_at) values($1,$2,'delivered',20000,0,'requested',now())", [order2,vendor2]); await collection(order2); }

// Small PostgREST-shaped adapter backed by the actual test database.
function serviceDb() {
  return {
    async rpc(name, args) {
      try { return { data: await scalar(`select ${name}(${Object.keys(args).map((key,i)=>`${key} => $${i+1}`).join(',')})`,Object.values(args)) }; }
      catch (error) { return { error }; }
    },
    from(table) {
      const conditions=[]; const values=[]; let limit=''; let orderBy='';
      const column = name => name === 'batch.status' ? '(select status from payout_batches where id=payout_batch_items.batch_id)'
        : name === 'queued.status' ? "(select status from payout_batch_items where batch_id=payout_batches.id and status='queued' limit 1)" : `"${name}"`;
      const query = {
        select() { return this; },
        eq(key,value) { values.push(value); conditions.push(`${column(key)}=$${values.length}`); return this; },
        neq(key,value) { values.push(value); conditions.push(`${column(key)}<>$${values.length}`); return this; },
        is(key,value) { conditions.push(`${column(key)} IS NULL`); return this; },
        not(key,op,value) { conditions.push(`${column(key)} IS NOT NULL`); return this; },
        lte(key,value) { values.push(value); conditions.push(`${column(key)}<=$${values.length}`); return this; },
        in(key,value) { values.push(value); conditions.push(`${column(key)}=ANY($${values.length})`); return this; },
        order(key,options) { orderBy=` ORDER BY ${column(key)} ${options?.ascending === false ? 'DESC' : 'ASC'}`; return this; },
        limit(value) { limit=` LIMIT ${Number(value)}`; return this; },
        async run(single=false) {
          try { const result=await db.query(`select * from ${table}${conditions.length ? ' WHERE '+conditions.join(' AND ') : ''}${orderBy}${limit}`,values); return {data:single ? result.rows[0] : result.rows}; }
          catch(error) { return {error}; }
        },
        single() { return this.run(true); }, maybeSingle() { return this.run(true); },
        then(resolve,reject) { return this.run().then(resolve,reject); }
      }; return query;
    }
  };
}

describe('payout PostgreSQL', () => {
  before(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE profiles(id uuid PRIMARY KEY, phone text, wallet_type text);
      CREATE TABLE orders(id uuid PRIMARY KEY, order_code text, vendor_id uuid, status text,total_amount bigint,protection_fee bigint DEFAULT 0,payout_status text,payment_confirmed_at timestamptz,is_demo boolean DEFAULT false,created_at timestamptz DEFAULT now(),token text);
      CREATE TABLE refund_requests(id uuid DEFAULT gen_random_uuid(),order_id uuid,status text);`);
    for (const file of ['create_payout_batches.sql','add_batch_commission_fields.sql','create_payment_transactions.sql']) await db.exec(fs.readFileSync(path.join(__dirname,'../scripts',file),'utf8'));
    await db.exec('ALTER TABLE payment_transactions ADD COLUMN batch_id uuid;');
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261023_controlled_payouts.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261024_provider_routed_payouts.sql'),'utf8'));
  });
  after(async () => { if (db) await db.close(); });
  beforeEach(async () => {
    await db.exec("TRUNCATE payout_dispatch_items,payout_dispatches,payout_batch_items,payout_batches,payment_transactions,refund_requests,orders,profiles,auth.users CASCADE; UPDATE payout_settings SET mode='manual',fallback_enabled=false;");
    await db.query('insert into auth.users(id) values($1),($2)',[vendor,vendor2]);
    await db.query("insert into profiles values($1,'771111111','wave-senegal'),($2,'772222222','wave-senegal')",[vendor,vendor2]);
    await db.query("insert into orders(id,vendor_id,status,total_amount,protection_fee,payout_status,payment_confirmed_at) values($1,$2,'delivered',10300,300,'requested',now())",[order,vendor]);
    await collection(order);
  });
  test('manuel par défaut, automatique suspendu', async () => { assert.equal(await batch('automatic'),null); assert.equal(await scalar('select count(*)::int from payout_batches'),0); });
  test('répare une base existante sans payout_processing_at et reprend le lot sans double réservation', async () => {
    const b=await batch();
    await db.exec('ALTER TABLE orders DROP COLUMN payout_processing_at');
    await assert.rejects(claim(b.id), /payout_processing_at.*does not exist/);
    assert.equal(await scalar('select count(*)::int from payout_dispatches'),0);
    assert.equal(await scalar('select payout_status from orders'),'scheduled');
    const repair=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261024_fix_payout_order_timestamps.sql'),'utf8');
    await db.exec(repair);
    const d=await claim(b.id);
    assert.ok(d.id);
    assert.ok(await scalar('select payout_processing_at from orders'));
    assert.equal(await claim(b.id),null);
    await settle(d.id,'repaired-tx','SUCCESSFUL');
    const paidAt=await scalar('select payout_paid_at from orders');
    await db.exec(repair);
    assert.equal(await scalar('select payout_status from orders'),'paid');
    assert.deepEqual(await scalar('select payout_paid_at from orders'),paidAt);
  });
  test('commission et exclusion des frais acheteur, réservation unique du lot', async () => {
    const [first,second]=await Promise.all([batch(),batch()]);
    assert.equal([first,second].filter(Boolean).length,1);
    assert.deepEqual((await db.query('select amount::int,commission_amount::int,net_amount::int from payout_batch_items')).rows[0],{amount:10000,commission_amount:200,net_amount:9800});
  });
  test('paiement non confirmé, démo et remboursement exclus', async () => {
    await db.exec('delete from payment_transactions'); await db.query('update orders set payment_confirmed_at=null'); assert.equal(await batch(),null);
    await db.query('update orders set payment_confirmed_at=now(),is_demo=true'); assert.equal(await batch(),null);
    await db.query('update orders set is_demo=false'); await db.query("insert into refund_requests(order_id,status) values($1,'pending')",[order]); assert.equal(await batch(),null);
  });
  test('inspection sans mutation et sans réouverture des commandes payées', async () => {
    await db.exec("update orders set payout_status='paid'");
    assert.equal((await scalar('select inspect_payout_order($1)',[order])).eligible,false);
    assert.equal(await scalar('select payout_status from orders'),'paid');
  });
  test('un seul envoi réservé pour deux appels, annulation bloquée après réservation', async () => {
    const b=await batch(); const results=await Promise.all([claim(b.id),claim(b.id)]);
    assert.equal(results.filter(Boolean).length,1);
    await assert.rejects(scalar('select cancel_controlled_payout_batch($1)',[b.id]),/annulation impossible/);
  });
  test('IPN rapide et répété : payé conservé après accusé de réception', async () => {
    const b=await batch(); const d=await claim(b.id);
    await settle(d.id,'tx','SUCCESSFUL'); await settle(d.id,'tx','PROCESSING'); await settle(d.id,'tx','SUCCESSFUL');
    assert.equal(await scalar('select payout_status from orders'),'paid');
    assert.equal(await scalar('select status from payout_batches'),'completed');
  });
  test('timeout inconnu bloque la relance et garde processing', async () => {
    const b=await batch(); const d=await claim(b.id); await settle(d.id,null,'UNKNOWN');
    assert.equal(await claim(b.id),null);
    assert.equal((await scalar('select inspect_payout_order($1)',[order])).eligible,false);
    assert.equal(await scalar('select payout_status from orders'),'processing');
  });
  test('succès partiel : autre vendeur toujours en cours', async () => {
    await seedSecondOrder(); const b=await batch(); const d=await claim(b.id); const d2=await claim(b.id,vendor2);
    await settle(d.id,'tx1','PROCESSING'); await settle(d2.id,'tx2','PROCESSING'); await settle(d.id,'tx1','SUCCESSFUL');
    assert.equal(await scalar('select payout_status from orders where id=$1',[order2]),'processing');
    assert.equal(await scalar('select status from payout_batches'),'processing');
  });
  test('trigger pay-in ne marque pas le vendeur payé', async () => {
    await db.query("insert into payment_transactions(transaction_id,order_id,status,transaction_type) values('payin',$1,'PENDING1','payment')",[order]);
    await db.exec("update payment_transactions set status='SUCCESSFUL'");
    assert.equal(await scalar('select payout_status from orders'),'requested');
  });
  test('échec confirmé : relance manuelle conserve net, automatique ne relance pas', async () => {
    await db.exec("update payout_settings set mode='automatic'"); const b=await batch('automatic'); const d=await claim(b.id,vendor,true);
    await settle(d.id,'failed-tx','FAILED'); assert.equal(await claim(b.id,vendor,true),null);
    const retry=await claim(b.id); assert.equal(retry.amount,9800);
  });
  test('pause bloque un lot automatique déjà créé', async () => {
    await db.exec("update payout_settings set mode='automatic'"); const b=await batch('automatic');
    await scalar("select set_payout_mode('manual',null)"); assert.equal(await claim(b.id,vendor,true),null);
  });
  test('annulation avant envoi conserve historique et permet nouveau lot', async () => {
    const b=await batch(); await scalar('select cancel_controlled_payout_batch($1)',[b.id]);
    assert.equal(await scalar('select count(*)::int from payout_batch_items'),1);
    assert.ok(await batch());
  });
  test('taux extrêmes et net nul refusés', async () => {
    for (const rate of [-1,100,101]) await assert.rejects(batch('manual',rate),/Commission invalide/);
    const b=await batch(); await db.exec('update payout_batch_items set net_amount=0');
    await assert.rejects(claim(b.id),/Montant net invalide/);
  });
  test('un ancien virement batch sans lien item bloque un nouvel envoi', async () => {
    const b=await batch();
    await db.query("insert into payment_transactions(transaction_id,batch_id,phone,status,transaction_type) values('legacy',$1,'771111111','PENDING1','payout')",[b.id]);
    assert.equal(await claim(b.id),null);
    assert.equal((await scalar('select inspect_payout_order($1)',[order])).eligible,false);
  });
  test('fonctions de paiement interdites aux sessions publiques', async () => {
    await db.exec('SET ROLE anon');
    try { await assert.rejects(batch(),/permission denied/); }
    finally { await db.exec('RESET ROLE'); }
  });
  test('service automatique complet, IPN avant réponse, tick suivant sans doublon', async () => {
    let sends=0; let service;
    service=createPayoutService({db:serviceDb(),env:{PAYOUT_COMMISSION_PCT:'2',PAYOUT_WEBHOOK_SECRET:'secret'},sendMoney:async params=>{
      sends++; assert.equal(params.amount,9800);
      await service.handleWebhook({transaction_id:'fast-tx',state:'SUCCESSFUL',amount:9800},'secret',{payout_attempt_id:params.payoutAttemptId});
      return {success:true,transaction_id:'fast-tx'};
    }});
    await service.setMode('automatic',null); await service.tick(); await service.tick();
    assert.equal(sends,1); assert.equal(await scalar('select payout_status from orders'),'paid');
  });
  test('relance individuelle via service conserve commission même si Render change', async () => {
    const b=await batch(); const d=await claim(b.id); await settle(d.id,'failed','FAILED');
    let amount;
    const service=createPayoutService({db:serviceDb(),env:{PAYOUT_COMMISSION_PCT:'10',PAYOUT_WEBHOOK_SECRET:'secret'},sendMoney:async params=>{amount=params.amount;return {success:true,transaction_id:'retry'};}});
    const report=await service.verifyOrder(order); assert.equal(Number(report.amounts.commission_pct),2);
    await service.payOrder(order,undefined,null); assert.equal(amount,9800);
  });
  test('encaissement réel décide du routage, y compris fallback acheteur', async () => {
    await db.exec("update payment_transactions set provider='paydunya_wave'");
    const report = await scalar('select inspect_payout_order($1)', [order]);
    assert.equal(report.collection_provider, 'paydunya');
    const b = await batch(); const d = await claim(b.id);
    assert.equal(d.provider, 'paydunya'); assert.equal(d.collection_provider, 'paydunya');
  });
  test('un vendeur, deux encaisseurs : deux virements séparés et bons montants', async () => {
    await seedSecondOrder();
    await db.query('update orders set vendor_id=$1 where id=$2', [vendor,order2]);
    await db.query("update payment_transactions set provider='paydunya' where order_id=$1", [order2]);
    const b = await batch(); const sends=[];
    const service=createPayoutService({db:serviceDb(),env:{PAYOUT_WEBHOOK_SECRET:'secret'},sendMoney:async p=>{sends.push(['pixpay',p.amount]);return {success:true,transaction_id:'pix'};},paydunya:{configured:()=>true,sendMoney:async p=>{sends.push(['paydunya',p.amount]);await p.recordReference('pd');return {success:true,verified_state:'PROCESSING',transaction_id:'paydunya:pd'};}}});
    await service.processBatch(b.id);
    assert.deepEqual(sends,[['pixpay',9800],['paydunya',19600]]);
    assert.deepEqual((await db.query('select provider from payment_transactions where transaction_type=\'payout\' order by amount')).rows.map(r=>r.provider),['pixpay','paydunya']);
  });
  test('prestataire inconnu ou double encaissement bloque la commande', async () => {
    await db.exec('delete from payment_transactions');
    assert.equal(await batch(),null);
    await collection(order);
    await db.query("insert into payment_transactions(transaction_id,order_id,amount,status,transaction_type,provider) select 'second',id,total_amount,'SUCCESSFUL','payment','paydunya' from orders");
    assert.equal(await batch(),null);
    assert.equal((await scalar('select inspect_payout_order($1)',[order])).eligible,false);
  });
  test('secours interdit pour attente/incertitude, autorisé une seule fois après échec', async () => {
    const b=await batch(); const d=await claim(b.id);
    assert.equal(await scalar('select claim_payout_fallback($1,false)',[d.id]),null);
    await settle(d.id,null,'UNKNOWN');
    assert.equal(await scalar('select claim_payout_fallback($1,false)',[d.id]),null);
    await settle(d.id,'failed','FAILED');
    const results=await Promise.all([scalar('select claim_payout_fallback($1,false)',[d.id]),scalar('select claim_payout_fallback($1,false)',[d.id])]);
    const fallback=results.find(Boolean);
    assert.equal(results.filter(Boolean).length,1); assert.equal(fallback.provider,'paydunya');
    assert.equal(fallback.collection_provider,'pixpay'); assert.equal(fallback.amount,9800); assert.equal(fallback.fallback_of,d.id);
    await settle(fallback.id,'paydunya:failed','FAILED');
    assert.equal(await scalar('select claim_payout_fallback($1,false)',[fallback.id]),null);
    assert.deepEqual(await scalar('select list_payout_fallback_candidates()'),[]);
  });
  test('réglage de secours et pause sont vérifiés au moment de réserver', async () => {
    await db.exec("update payout_settings set mode='automatic'"); const b=await batch('automatic'); const d=await claim(b.id,vendor,true);
    await settle(d.id,'failed','FAILED');
    assert.equal(await scalar('select claim_payout_fallback($1,true)',[d.id]),null);
    await scalar('select set_payout_fallback(true,null)'); await scalar("select set_payout_mode('manual',null)");
    assert.equal(await scalar('select claim_payout_fallback($1,true)',[d.id]),null);
    await scalar("select set_payout_mode('automatic',null)");
    assert.equal((await scalar('select claim_payout_fallback($1,true)',[d.id])).provider,'paydunya');
  });
  test('réservation avec un autre prestataire ne peut pas détourner un encaissement', async () => {
    const b=await batch();
    assert.equal(await scalar('select claim_payout_dispatch($1,$2,false,null,\'paydunya\',null)',[b.id,vendor]),null);
    assert.equal(await scalar('select count(*)::int from payout_dispatches'),0);
  });
  test('PayDunya incertain puis échec vérifié : secours Pixpay automatique unique', async () => {
    await db.exec("update payment_transactions set provider='paydunya'; update payout_settings set mode='automatic',fallback_enabled=true");
    let primary=0; let backup=0; let verifiedState='PROCESSING';
    const service=createPayoutService({db:serviceDb(),env:{PAYOUT_COMMISSION_PCT:'2',PAYOUT_WEBHOOK_SECRET:'secret'},sendMoney:async()=>{backup++;return {success:true,transaction_id:'backup-pix'};},paydunya:{configured:()=>true,sendMoney:async p=>{primary++;await p.recordReference('timeout-token');return {success:false,uncertain:true,transaction_id:'paydunya:timeout-token'};},checkStatus:async()=>({state:verifiedState,transaction_id:'paydunya:timeout-token'})}});
    await service.tick(); assert.equal(primary,1); assert.equal(backup,0);
    await service.tick(); assert.equal(primary,1); assert.equal(backup,0);
    verifiedState='FAILED'; await service.tick(); assert.equal(backup,1);
    await service.tick(); assert.equal(backup,1);
  });
  test('encaissement PayDunya confirmé conserve sa provenance sans payer le vendeur', async () => {
    await db.query("update orders set token='pd-invoice'");
    await db.exec('delete from payment_transactions');
    await scalar("select record_paydunya_collection($1,'pd-invoice',10300)",[order]);
    assert.equal(await scalar('select payout_status from orders'),'requested');
    assert.equal(await scalar('select payout_collection_provider($1)',[order]),'paydunya');
    await scalar("select record_paydunya_collection($1,'pd-invoice',10300)",[order]);
    assert.equal(await scalar('select count(*)::int from payment_transactions'),1);
  });
  test('migration rejouée conserve mode et secours existants', async () => {
    await db.exec("update payout_settings set mode='automatic',fallback_enabled=true");
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261024_provider_routed_payouts.sql'),'utf8'));
    assert.equal(await scalar('select mode from payout_settings'),'automatic');
    assert.equal(await scalar('select fallback_enabled from payout_settings'),true);
  });
  test('encaissement sandbox ne peut pas déclencher un payout réel chez un autre prestataire', async () => {
    await db.query("update orders set token='test-invoice'"); await db.exec('delete from payment_transactions');
    await scalar("select record_paydunya_collection($1,'test-invoice',10300,true)",[order]);
    assert.equal(await scalar('select is_demo from orders'),true);
    assert.equal(await scalar('select provider from payment_transactions'),'paydunya_sandbox');
    assert.equal(await batch(),null);
  });
  test('IPN PayDunya : hash, token, montant et prestataire vérifiés ; notification unique', async () => {
    await db.exec("update payment_transactions set provider='paydunya'");
    const b=await batch(); const d=await claim(b.id);
    await scalar("select bind_payout_reference($1,'pd-token')",[d.id]);
    let checks=0; let notifications=0;
    const service=createPayoutService({db:serviceDb(),env:{PAYOUT_WEBHOOK_SECRET:'secret',PAYDUNYA_MASTER_KEY:'master'},sendMoney:async()=>{throw new Error('No send');},onPaid:async()=>{notifications++;},paydunya:{configured:()=>true,checkStatus:async()=>{checks++;return {state:'SUCCESSFUL',transaction_id:'paydunya:pd-token'};}}});
    const valid={hash:require('node:crypto').createHash('sha512').update('master').digest('hex'),token:'pd-token',amount:'9800.00'};
    for(const invalid of [{...valid,hash:'bad'},{...valid,token:'other'},{...valid,amount:1}])await assert.rejects(service.handlePaydunyaWebhook(invalid,'secret',d.id));
    await assert.rejects(service.handleWebhook({transaction_id:'spoof',state:'SUCCESSFUL'},'secret',{payout_attempt_id:d.id}),/Prestataire IPN/);
    assert.equal(checks,0); assert.equal(await scalar('select payout_status from orders'),'processing');
    await service.handlePaydunyaWebhook(valid,'secret',d.id); await service.handlePaydunyaWebhook(valid,'secret',d.id);
    assert.equal(await scalar('select payout_status from orders'),'paid'); assert.equal(notifications,1);
  });
});
