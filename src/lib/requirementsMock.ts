// Requerimientos (RQ) de ejemplo para el inicio, hasta integrar AutFMI por API.
// Campos alineados al RQ del sistema heredado: código, cliente, título, vencimiento, vacantes, postulantes, ingresos.
export type RqMock = {
  id: string; code: string; client: string; title: string; requestedAt: string; dueDate: string;
  vacancies: number; covered: number; applicants: number;
};
export type RqMonthMock = { month: string; withHires: number; hires: number };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function requirementsMock(today: string) {
  const rq = (i: number, client: string, title: string, req: number, due: number, vac: number, cov: number, app: number): RqMock => ({
    id: `demo-${i}`, code: `RQ-${today.slice(2, 4)}${String(140 + i).padStart(4, '0')}`, client, title,
    requestedAt: addDays(today, req), dueDate: addDays(today, due), vacancies: vac, covered: cov, applicants: app,
  });
  const all = [
    rq(1, 'Banco Andino', 'Desarrollador Java Senior', -26, 0, 2, 1, 9),
    rq(2, 'Retail Plus', 'Analista QA Automatizador', -20, 0, 1, 0, 4),
    rq(3, 'Seguros del Sur', 'Data Engineer Python', -3, 25, 3, 0, 12),
    rq(4, 'Logística Express', 'Scrum Master', -2, 26, 1, 0, 3),
    rq(5, 'Banco Andino', 'Arquitecto Cloud AWS', -1, 27, 1, 0, 7),
    rq(6, 'Telco Perú', 'Desarrollador React', 0, 28, 2, 0, 5),
    rq(7, 'Minera Norte', 'Analista de Datos Power BI', -12, 2, 1, 0, 15),
    rq(8, 'Retail Plus', 'DevOps Engineer', -15, 5, 2, 1, 10),
  ];
  const ym = (back: number) => { const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
  return {
    dueToday: all.filter((r) => r.dueDate === today),
    newest: [...all].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0, 5),
    mostApplicants: [...all].filter((r) => r.covered < r.vacancies).sort((a, b) => b.applicants - a.applicants).slice(0, 5),
    months: [{ month: ym(2), withHires: 4, hires: 6 }, { month: ym(1), withHires: 5, hires: 7 }, { month: ym(0), withHires: 3, hires: 4 }] as RqMonthMock[],
  };
}
