import { useEffect, useRef } from 'react';

type Options = {
  enabled?: boolean;
  onPollOrders?: () => void | Promise<void>;
  onPollTransactions?: () => void | Promise<void>;
  ordersIntervalMs?: number;
  transactionsIntervalMs?: number;
};

export default function useBackgroundPolling(opts: Options) {
  const { enabled = false, onPollOrders, onPollTransactions, ordersIntervalMs = 5000, transactionsIntervalMs = 10000 } = opts || {};

  const onPollOrdersRef = useRef(onPollOrders);
  const onPollTxRef = useRef(onPollTransactions);

  useEffect(() => { onPollOrdersRef.current = onPollOrders; }, [onPollOrders]);
  useEffect(() => { onPollTxRef.current = onPollTransactions; }, [onPollTransactions]);

  useEffect(() => {
    if (!enabled) return;

    let ordersInterval: number | null = null;
    let txInterval: number | null = null;

    // Run immediately once
    try { if (onPollOrdersRef.current) { onPollOrdersRef.current(); } } catch (e) { console.warn('[useBackgroundPolling] initial onPollOrders failed', e); }
    try { if (onPollTxRef.current) { onPollTxRef.current(); } } catch (e) { console.warn('[useBackgroundPolling] initial onPollTransactions failed', e); }

    ordersInterval = window.setInterval(() => {
      try { if (onPollOrdersRef.current) onPollOrdersRef.current(); } catch (e) { console.warn('[useBackgroundPolling] onPollOrders error', e); }
    }, ordersIntervalMs);

    txInterval = window.setInterval(() => {
      try { if (onPollTxRef.current) onPollTxRef.current(); } catch (e) { console.warn('[useBackgroundPolling] onPollTransactions error', e); }
    }, transactionsIntervalMs);

    return () => {
      try { if (ordersInterval) clearInterval(ordersInterval); } catch (e) {}
      try { if (txInterval) clearInterval(txInterval); } catch (e) {}
    };
  }, [enabled, ordersIntervalMs, transactionsIntervalMs]);
}
