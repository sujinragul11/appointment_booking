import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/client';
import { downloadInvoice } from '../../api/site';
import AccountNav from '../../components/AccountNav';
import StatusBadge, { useStatusLabel } from '../../components/StatusBadge';
import { InlineLoader } from '../../components/Loader';
import { useToast } from '../../components/Toast';
import { useI18n } from '../../i18n';
import { formatMoney } from '../../utils/format';
import { formatStamp } from '../../utils/bookingCalendar';

/** FR-40: the customer's payments with invoices and refunds (GET /payments/history). */
export default function PaymentsPage() {
  const { t, locale } = useI18n();
  const statusLabel = useStatusLabel();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.get('/payments/history')
      .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
      .catch((e) => { setItems((prev) => prev || []); setError(getErrorMessage(e, t('site.payments.loadFailed'))); });
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const invoice = async (p) => {
    setDownloading(p.id);
    try {
      await downloadInvoice(p.appointmentId, p.bookingRef);
    } catch (e) {
      toast(getErrorMessage(e, t('site.appointment.downloadFailed')), 'error');
    } finally {
      setDownloading(null);
    }
  };

  const totalPaid = (items || []).reduce((sum, p) => sum + (['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status) ? Number(p.amount || 0) : 0), 0);
  const totalRefunded = (items || []).reduce((sum, p) => sum + Number(p.refundAmount || 0), 0);

  return (
    <div className="dash">
      <AccountNav />
      <div className="dash-main">
        <div className="section-title">
          <div>
            <h1 className="dash-title">{t('site.payments.title')}</h1>
            <p>{t('site.payments.lead')}</p>
          </div>
        </div>

        {error && (
          <div className="form-error" role="alert">
            {error}{' '}
            <button type="button" className="btn btn-outline btn-xs" onClick={load}>{t('common.retry')}</button>
          </div>
        )}

        {!items ? (
          <p className="muted-line" role="status"><InlineLoader label={t('common.loading')} /> {t('common.loading')}</p>
        ) : items.length === 0 ? (
          !error && (
            <div className="empty card card-pad">
              <div className="empty-ico" aria-hidden="true">{'\u{1F4B3}'}</div>
              <h2 className="empty-title">{t('site.payments.empty')}</h2>
              <p className="mt-1">{t('site.payments.emptyText')}</p>
            </div>
          )
        ) : (
          <>
            <dl className="stat-strip">
              <div><dt>{t('site.payments.totalPaid')}</dt><dd>{formatMoney(totalPaid)}</dd></div>
              <div><dt>{t('site.payments.totalRefunded')}</dt><dd>{formatMoney(totalRefunded)}</dd></div>
              <div><dt>{t('site.payments.count')}</dt><dd>{items.length}</dd></div>
            </dl>
            <ul className="plain-list payment-list">
              {items.map((p) => (
                <li key={p.id} className="card card-pad payment-card">
                  <div className="payment-head">
                    <div>
                      <h2 className="payment-title">{p.serviceName}</h2>
                      <p className="payment-sub">
                        {p.providerName} · <Link to={`/appointments/${p.appointmentId}`}>{t('site.appointment.refShort', { ref: p.bookingRef })}</Link>
                      </p>
                    </div>
                    <div className="payment-amount">
                      <strong>{formatMoney(p.amount)}</strong>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <dl className="kv payment-kv">
                    <dt className="k">{t('site.appointment.method')}</dt><dd>{p.method ? statusLabel(p.method) : '—'}</dd>
                    {p.option && <><dt className="k">{t('site.appointment.option')}</dt><dd>{t(`site.payOption.${p.option}`)}</dd></>}
                    <dt className="k">{t('site.payments.date')}</dt><dd>{formatStamp(p.paidAt || p.createdAt, locale)}</dd>
                    {p.balanceDue > 0 && <><dt className="k">{t('site.appointment.balanceDue')}</dt><dd>{formatMoney(p.balanceDue)}</dd></>}
                    {p.refundAmount > 0 && (
                      <>
                        <dt className="k">{t('site.appointment.refunded')}</dt>
                        <dd>{formatMoney(p.refundAmount)}{p.refundedAt ? ` · ${formatStamp(p.refundedAt, locale)}` : ''}
                          {p.refundId && <span className="hint block break-all">{t('site.appointment.refundId', { id: p.refundId })}</span>}</dd>
                      </>
                    )}
                    {p.invoiceNumber && <><dt className="k">{t('site.appointment.invoiceNo')}</dt><dd className="break-all">{p.invoiceNumber}</dd></>}
                    {p.transactionId && <><dt className="k">{t('site.appointment.txn')}</dt><dd className="break-all">{p.transactionId}</dd></>}
                  </dl>
                  {p.invoiceNumber && (
                    <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => invoice(p)} disabled={downloading === p.id}
                      aria-label={t('site.payments.invoiceAria', { ref: p.bookingRef })}>
                      {downloading === p.id ? <InlineLoader label={t('site.appointment.downloading')} /> : t('site.appointment.invoice')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
