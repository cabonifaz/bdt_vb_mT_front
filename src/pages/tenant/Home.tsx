import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/auth';
import { useTheme } from '../../providers/theme';
import { Card } from '../../components/ui';

export function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { branding } = useTheme();
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('home.welcome', { name: user?.fullName.split(' ')[0] })}</h1>
          <p className="muted">{t('home.subtitle', { tenant: branding?.name ?? user?.tenantSlug })}</p>
        </div>
      </div>
      <Card title={t('nav.talents')}>
        <p className="muted">{t('home.talentsSoon')}</p>
      </Card>
    </div>
  );
}
