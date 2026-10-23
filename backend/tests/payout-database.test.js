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
async function seedSecondOrder() { await db.query("insert into orders(id,vendor_id,status,total_amount,protection_fee,payout_status,payment_confirmed_at) values($1,$2,'delivered',20000,0,'requested',now())", [order2,vendor2]); }

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
      CREATE TABLE orders(id uuid PRIMARY KEY, order_code text, vendor_id uuid, status text,total_amount bigint,protection_fee bigint DEFAULT 0,payout_status text,payment_confirmed_at timestamptz,is_demo boolean DEFAULT false,payout_paid_at timestamptz,payout_processing_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE refund_requests(id uuid DEFAULT gen_random_uuid(),order_id uuid,status text);`);
    for (const file of ['create_payout_batches.sql','add_batch_commission_fields.sql','create_payment_transactions.sql']) await db.exec(fs.readFileSync(path.join(__dirname,'../scripts',file),'utf8'));
    await db.exec('ALTER TABLE payment_transactions ADD COLUMN batch_id uuid;');
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261023_controlled_payouts.sql'),'utf8'));
  });
  after(async () => { if (db) await db.close(); });
  beforeEach(async () => {
    await db.exec("TRUNCATE payout_dispatch_items,payout_dispatches,payout_batch_items,payout_batches,payment_transactions,refund_requests,orders,profiles,auth.users CASCADE; UPDATE payout_settings SET mode='manual';");
    await db.query('insert into auth.users(id) values($1),($2)',[vendor,vendor2]);
    await db.query("insert into profiles values($1,'771111111','wave-senegal'),($2,'772222222','wave-senegal')",[vendor,vendor2]);
    await db.query("insert into orders(id,vendor_id,status,total_amount,protection_fee,payout_status,payment_confirmed_at) values($1,$2,'delivered',10300,300,'requested',now())",[order,vendor]);
  });
  test('manuel par défaut, automatique suspendu', async () => { assert.equal(await batch('automatic'),null); assert.equal(await scalar('select count(*)::int from payout_batches'),0); });
  test('commission et exclusion des frais acheteur, réservation unique du lot', async () => {
    const [first,second]=await Promise.all([batch(),batch()]);
    assert.equal([first,second].filter(Boolean).length,1);
    assert.deepEqual((await db.query('select amount::int,commission_amount::int,net_amount::int from payout_batch_items')).rows[0],{amount:10000,commission_amount:200,net_amount:9800});
  });
  test('paiement non confirmé, démo et remboursement exclus', async () => {
    await db.query('update orders set payment_confirmed_at=null'); assert.equal(await batch(),null);
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
});
