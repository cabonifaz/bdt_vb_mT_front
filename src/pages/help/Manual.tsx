// Manual de usuario: general (todas las funcionalidades) o por rol, con pasos numerados, ejemplos y consejos.
// Se ocultan las secciones de funcionalidades que la empresa no tiene activas. Se puede imprimir o guardar en PDF.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Lightbulb, Printer } from 'lucide-react';
import { useAuth } from '../../providers/auth';
import { MANUAL, MANUAL_ROLES, ROLE_SUMMARY, type Role } from './manualContent';
import { Button } from '../../components/ui';

type View = 'GENERAL' | Role;

export function Manual({ platform = false }: { platform?: boolean }) {
  const { t, i18n } = useTranslation();
  const { user, has } = useAuth();
  const own = (platform ? 'SUPER_ADMIN' : (user?.roles.find((r) => MANUAL_ROLES.includes(r as Role)) ?? 'VIEWER')) as Role;
  const [view, setView] = useState<View>(own);
  // el usuario de una empresa no ve el manual del Super Admin; el Super Admin ve todos
  const views: View[] = platform ? ['GENERAL', ...MANUAL_ROLES] : ['GENERAL', ...MANUAL_ROLES.filter((r) => r !== 'SUPER_ADMIN')];
  const sections = useMemo(() => MANUAL.filter((s) =>
    (view === 'GENERAL' ? platform || !s.roles.every((r) => r === 'SUPER_ADMIN') : s.roles.includes(view)) && (!s.feature || has(s.feature))),
  [view, platform, has]);
  const chapters = [...new Set(sections.map((s) => s.chapter))];
  return (
    <div className="page manual">
      <div className="page-header no-print">
        <div><h1>{t('manual.title')}</h1><p className="muted">{t('manual.subtitle')}</p></div>
        <Button variant="secondary" onClick={() => window.print()} data-testid="manual-print"><Printer size={16} />{t('manual.print')}</Button>
      </div>
      <div className="manual-views no-print" role="group" aria-label={t('manual.which')} data-testid="manual-views">
        {views.map((v) => (
          <button key={v} type="button" className={`rq-scope${view === v ? ' active' : ''}`} aria-pressed={view === v} onClick={() => setView(v)} data-testid={`manual-view-${v}`}>
            {v === 'GENERAL' ? t('manual.general') : t(`roles.${v}`)}{v === own && <span className="rq-scope-count">{t('manual.yours')}</span>}
          </button>
        ))}
      </div>
      {i18n.language?.startsWith('en') && <div className="alert alert-info no-print" role="status">{t('manual.spanishOnly')}</div>}
      <article className="manual-doc" data-testid="manual-doc">
        <header className="manual-cover">
          <BookOpen size={28} aria-hidden />
          <div>
            <h2>{view === 'GENERAL' ? t('manual.generalTitle') : t('manual.roleTitle', { role: t(`roles.${view}`) })}</h2>
            <p className="muted">{view === 'GENERAL' ? t('manual.generalIntro') : ROLE_SUMMARY[view]}</p>
          </div>
        </header>
        <nav className="manual-toc" aria-label={t('manual.toc')}>
          <h3>{t('manual.toc')}</h3>
          <ol>{chapters.map((c) => (
            <li key={c}><strong>{c}</strong>
              <ol>{sections.filter((s) => s.chapter === c).map((s) => <li key={s.id}><a href={`#m-${s.id}`}>{s.title}</a></li>)}</ol>
            </li>
          ))}</ol>
        </nav>
        {chapters.map((c, ci) => (
          <section key={c} className="manual-chapter">
            <h2>{ci + 1}. {c}</h2>
            {sections.filter((s) => s.chapter === c).map((s, si) => (
              <section key={s.id} id={`m-${s.id}`} className="manual-section" data-testid="manual-section">
                <h3>{ci + 1}.{si + 1} {s.title}</h3>
                {view === 'GENERAL' && <p className="manual-roles">{t('manual.for')}: {s.roles.map((r) => t(`roles.${r}`)).join(', ')}</p>}
                <p>{s.intro}</p>
                <ol className="manual-steps">{s.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>
                {s.example && <div className="tour-example"><strong>{t('tour.example')}</strong> {s.example}</div>}
                {s.tips && s.tips.length > 0 && (
                  <ul className="manual-tips">{s.tips.map((tip, k) => <li key={k}><Lightbulb size={14} aria-hidden /> {tip}</li>)}</ul>
                )}
              </section>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
