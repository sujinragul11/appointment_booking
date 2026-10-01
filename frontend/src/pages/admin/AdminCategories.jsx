import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { getErrorMessage } from '../../api/client';
import { createCategory, deleteCategory, fetchCategories, updateCategory } from '../../api/admin';
import AdminLayout from './AdminLayout';
import { ConfirmDialog, DataState, Field, TableWrap, fieldErrors } from './adminUi';
import { useLoader, usePlural } from './adminHooks';

export function validateCategory(form) {
  const errors = {};
  if (!form.name.trim() || form.name.trim().length > 80) errors.name = 'admin.categories.errName';
  if (form.icon.length > 100) errors.icon = 'admin.categories.errIcon';
  if (form.description.length > 255) errors.description = 'admin.categories.errDescription';
  return errors;
}

/** Categories (FR-12): list, create, edit and delete (a category in use cannot be deleted). */
export default function AdminCategories() {
  const t = useT();
  const plural = usePlural();
  const list = useLoader(fetchCategories, 'categories');
  const [editing, setEditing] = useState(null); // { category } - undefined category when creating
  const [deleting, setDeleting] = useState(null);
  const categories = Array.isArray(list.data) ? list.data : [];

  return (
    <AdminLayout
      title={t('admin.categories.title')}
      subtitle={t('admin.categories.subtitle')}
      actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({})}>{t('admin.categories.add')}</button>}
    >
      <DataState loading={list.loading} error={list.error} hasData={Array.isArray(list.data)} onRetry={list.reload}
        empty={Array.isArray(list.data) && categories.length === 0} emptyTitle={t('admin.categories.empty')} emptyText={t('admin.categories.emptyText')}>
        <p className="admin-count" aria-live="polite">{plural('admin.categories.count', categories.length)}</p>
        <TableWrap label={t('admin.categories.tableLabel')} busy={list.loading}>
          <table className="table admin-table">
            <caption className="sr-only">{t('admin.categories.tableLabel')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.categories.colName')}</th>
                <th scope="col">{t('admin.categories.colSlug')}</th>
                <th scope="col">{t('admin.categories.colDescription')}</th>
                <th scope="col">{t('admin.common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="adm-cell-main">
                    <span className="adm-cell-with-icon">
                      <span className="adm-cat-icon" aria-hidden="true">{c.icon || '•'}</span>
                      <span className="adm-cell-title">{c.name}</span>
                    </span>
                  </th>
                  <td><code className="adm-code">{c.slug}</code></td>
                  <td>{c.description || '—'}</td>
                  <td>
                    <div className="adm-actions">
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => setEditing({ category: c })}
                        aria-label={`${t('admin.common.edit')}: ${c.name}`}>{t('admin.common.edit')}</button>
                      <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => setDeleting(c)}
                        aria-label={`${t('admin.common.delete')}: ${c.name}`}>{t('admin.common.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </DataState>

      {editing ? (
        <CategoryDialog category={editing.category} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />
      ) : null}
      {deleting ? (
        <DeleteCategoryDialog category={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); list.reload(); }} />
      ) : null}
    </AdminLayout>
  );
}

function CategoryDialog({ category, onClose, onSaved }) {
  const t = useT();
  const toast = useToast();
  const formRef = useRef(null);
  const [form, setForm] = useState({ name: category?.name || '', icon: category?.icon || '', description: category?.description || '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(category);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const focusFirstError = () => setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);

  const submit = async (e) => {
    e.preventDefault();
    const invalid = validateCategory(form);
    if (Object.keys(invalid).length) {
      setErrors(Object.fromEntries(Object.entries(invalid).map(([k, key]) => [k, t(key)])));
      focusFirstError();
      return;
    }
    const payload = { name: form.name.trim(), icon: form.icon.trim() || null, description: form.description.trim() || null };
    setBusy(true);
    setFormError('');
    try {
      const saved = editing ? await updateCategory(category.id, payload) : await createCategory(payload);
      toast(t(editing ? 'admin.categories.updated' : 'admin.categories.created', { name: saved?.name || payload.name }), 'success');
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(getErrorMessage(err));
      setBusy(false);
      focusFirstError();
    }
  };

  return (
    <Modal title={editing ? t('admin.categories.editTitle', { name: category.name }) : t('admin.categories.createTitle')}
      onClose={onClose} closeDisabled={busy} closeOnBackdrop={false}>
      <form ref={formRef} onSubmit={submit} noValidate>
        <Field label={t('admin.categories.fieldName')} error={errors.name} required>
          {(props) => <input {...props} type="text" maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label={t('admin.categories.fieldIcon')} hint={t('admin.categories.fieldIconHint')} error={errors.icon}>
          {(props) => <input {...props} type="text" maxLength={100} value={form.icon} onChange={(e) => set('icon', e.target.value)} />}
        </Field>
        <Field label={t('admin.categories.fieldDescription')} error={errors.description}>
          {(props) => <textarea {...props} rows={3} maxLength={255} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="adm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{t('admin.common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('admin.common.saving') : editing ? t('admin.common.save') : t('admin.categories.createSubmit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteCategoryDialog({ category, onClose, onDeleted }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inUse, setInUse] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteCategory(category.id);
      toast(t('admin.categories.deleted', { name: category.name }), 'success');
      onDeleted();
    } catch (err) {
      if (err?.response?.status === 409) {
        setInUse(true);
        setError(t('admin.categories.inUse', { name: category.name }));
      } else {
        setError(getErrorMessage(err));
      }
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog title={t('admin.categories.deleteTitle', { name: category.name })} confirmLabel={t('admin.categories.deleteConfirm')}
      busyLabel={t('admin.common.deleting')} onConfirm={remove} onClose={onClose} busy={busy} error={error} confirmHidden={inUse}>
      <p>{t('admin.categories.deleteText')}</p>
    </ConfirmDialog>
  );
}
