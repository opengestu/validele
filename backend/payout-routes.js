function registerPayoutRoutes(app, requireAdmin, service) {
  const wrap = handler => async (req, res) => {
    try { return res.json(await handler(req)); }
    catch (error) { return res.status(409).json({ success: false, error: error.message }); }
  };
  const pay = wrap(req => {
    if (!req.body?.orderId) throw new Error('orderId requis');
    return service.payOrder(req.body.orderId, undefined, req.adminUser.id);
  });
  app.post('/api/admin/payout-order', requireAdmin, pay);
  app.post('/api/payment/pixpay/payout', requireAdmin, pay);
  app.post('/api/admin/verify-and-payout', requireAdmin, async (req, res) => {
    if (req.body?.execute === true) return pay(req, res);
    return wrap(async () => {
      if (!req.body?.orderId) throw new Error('orderId requis');
      return { success: true, report: await service.verifyOrder(req.body.orderId) };
    })(req, res);
  });
  app.get('/api/admin/payout-settings', requireAdmin, wrap(async () => ({ success: true, settings: await service.settings() })));
  app.get('/api/admin/payout-attempts', requireAdmin, wrap(async () => ({ success: true, attempts: await service.attempts() })));
  app.put('/api/admin/payout-settings', requireAdmin, wrap(async req => {
    await service.setMode(req.body?.mode, req.adminUser.id);
    return { success: true, settings: await service.settings() };
  }));
  app.post('/api/admin/payout-batches/create', requireAdmin, wrap(async req => {
    const batch = await service.createBatch({ actorId: req.adminUser.id, notes: req.body?.notes, scheduledAt: req.body?.scheduled_at });
    return { success: true, batch, message: batch ? 'Batch créé' : 'Aucune commande éligible' };
  }));
  app.post('/api/admin/payout-batches/:id/process', requireAdmin, wrap(req => service.processBatch(req.params.id)));
  app.post('/api/admin/payout-batches/:id/cancel', requireAdmin, wrap(req => service.cancelBatch(req.params.id)));
  app.post('/api/admin/finalize-payout', requireAdmin, (req, res) => res.status(410).json({ success: false, error: 'Confirmation fournisseur requise ; finalisation forcée désactivée' }));
}
module.exports = { registerPayoutRoutes };
