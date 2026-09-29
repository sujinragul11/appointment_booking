import { useCallback, useRef, useState } from 'react';
import Modal from './Modal';
import Countdown from './Countdown';
import { InlineLoader } from './Loader';
import { getErrorMessage } from '../api/client';
import {
  RAZORPAY_CHECKOUT_SRC, completeDemoPayment, createPaymentOrder, loadScript, verifyPayment
} from '../api/site';
import { useT } from '../i18n';
import { formatMoney } from '../utils/format';
import { localDeadline } from '../utils/countdown';
import { tp } from '../utils/plural';

/**
 * Online payment for a booking (FR-37, FR-38). `start(appointmentId)` creates the order
 * (POST /payments/create-order), then opens Razorpay Checkout — or, when the server runs
 * in payments demo mode, a clearly labelled simulated checkout.
 *
 * Callbacks: onPaid(appointmentId) after a verified payment; onDismiss(appointmentId) when
 * the customer closes the checkout (the booking stays reserved until the order expires);
 * onError(error, appointmentId) when the payment could not be started or verified.
 * Render `dialog` somewhere in the page.
 */
export function usePayment({ onPaid, onDismiss, onError }) {
  const t = useT();
  const [demo, setDemo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demoError, setDemoError] = useState('');
  const handlers = useRef({ onPaid, onDismiss, onError });
  handlers.current = { onPaid, onDismiss, onError };

  const start = useCallback(async (appointmentId) => {
    setBusy(true);
    setDemoError('');
    try {
      const order = await createPaymentOrder(appointmentId);
      if (order.demoMode) {
        setDemo({ appointmentId, order, deadline: localDeadline(order.expiresAt, order.serverDate) });
        return;
      }
      await loadScript(RAZORPAY_CHECKOUT_SRC);
      if (typeof window.Razorpay !== 'function') throw new Error(t('site.payment.gatewayUnavailable'));
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountMinor,
        currency: order.currency,
        name: 'Sloto',
        description: order.description,
        prefill: { name: order.customerName || '', email: order.customerEmail || '', contact: order.customerPhone || '' },
        notes: { bookingRef: order.bookingRef || '' },
        theme: { color: '#4f46e5' },
        handler: async (response) => {
          setBusy(true);
          try {
            await verifyPayment({
              appointmentId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });
            handlers.current.onPaid?.(appointmentId);
          } catch (e) {
            handlers.current.onError?.(e, appointmentId);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => handlers.current.onDismiss?.(appointmentId), escape: true }
      });
      checkout.open();
    } catch (e) {
      handlers.current.onError?.(e, appointmentId);
    } finally {
      setBusy(false);
    }
  }, [t]);

  const payDemo = async () => {
    if (!demo || busy) return;
    setBusy(true);
    setDemoError('');
    try {
      await completeDemoPayment(demo.appointmentId);
      const id = demo.appointmentId;
      setDemo(null);
      handlers.current.onPaid?.(id);
    } catch (e) {
      setDemoError(getErrorMessage(e, t('site.payment.failed')));
    } finally {
      setBusy(false);
    }
  };

  const closeDemo = () => {
    if (!demo || busy) return;
    const id = demo.appointmentId;
    setDemo(null);
    handlers.current.onDismiss?.(id);
  };

  const dialog = demo ? (
    <Modal title={t('site.payment.demoTitle')} onClose={closeDemo} closeDisabled={busy} closeOnBackdrop={false}>
      <div className="demo-accounts" role="note">
        <strong>{t('site.payment.demoBadge')}</strong>
        <p className="mt-1">{t('site.payment.demoText')}</p>
      </div>
      <dl className="kv mt-3">
        <dt className="k">{t('site.payment.booking')}</dt><dd className="break-all">{demo.order.bookingRef}</dd>
        {demo.order.description && <><dt className="k">{t('site.payment.for')}</dt><dd>{demo.order.description}</dd></>}
        <dt className="k">{t('site.payment.order')}</dt><dd className="break-all">{demo.order.orderId}</dd>
        <dt className="k">{t('site.payment.amount')}</dt>
        <dd><strong className="pay-amount">{formatMoney(demo.order.amount)}</strong> {demo.order.currency && demo.order.currency !== 'INR' ? demo.order.currency : ''}</dd>
      </dl>
      {demo.deadline && (
        <p className="hold-banner mt-2">
          {t('site.payment.reservedFor')}{' '}
          <Countdown deadline={demo.deadline} announce={(m) => tp(t, 'site.payment.minutesLeft', { count: m })}
            expiredText={t('site.payment.expired')} />
        </p>
      )}
      {demoError && <div className="form-error mt-2" role="alert">{demoError}</div>}
      <button type="button" className="btn btn-success btn-block btn-lg mt-3" disabled={busy} onClick={payDemo}>
        {busy ? <InlineLoader label={t('site.payment.processing')} /> : t('site.payment.payDemo')}
      </button>
      <button type="button" className="btn btn-ghost btn-block mt-2" disabled={busy} onClick={closeDemo}>
        {t('site.payment.later')}
      </button>
      <p className="hint mt-2 center">{t('site.payment.laterHint')}</p>
    </Modal>
  ) : null;

  return { start, busy, dialog };
}
