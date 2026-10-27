// CV en PDF con la marca del tenant (equivalente al "CV Fractal" del sistema heredado, pero configurable por tenant).
// Estructura: cabecera (imagen del tenant o banda con logo y colores), nombre, puesto, resumen y secciones numeradas
// que solo aparecen si tienen datos; pie fijo con texto del tenant, fecha de generación y número de página.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export type CvLang = 'es' | 'en';
export type CvExperience = { company: string; position: string; start: string; end?: string; current: boolean; functions?: string };
export type CvEducation = { institution: string; career: string; grade?: string; start?: string; end?: string; current: boolean; yearOnly: boolean };
export type CvData = {
  name: string; headline?: string; summary?: string; location?: string; photo?: string;
  experiences: CvExperience[]; educations: CvEducation[]; certifications: CvEducation[];
  tech: { name: string; years: number }[]; soft: string[]; languages: { name: string; level: string }[];
};
export type CvTemplate = {
  displayName: string; colorPrimary: string; colorSecondary: string;
  header?: string; footer?: string; logo?: string; footerText?: string; showPhoto: boolean;
};

const L = {
  es: { profile: 'Perfil profesional', experience: 'Experiencia laboral', education: 'Educación', certifications: 'Certificaciones',
    tech: 'Habilidades técnicas', soft: 'Habilidades blandas', languages: 'Idiomas', present: 'Actualidad', year: 'año', years: 'años',
    generated: 'Fecha de generación' },
  en: { profile: 'Professional summary', experience: 'Work experience', education: 'Education', certifications: 'Certifications',
    tech: 'Technical skills', soft: 'Soft skills', languages: 'Languages', present: 'Present', year: 'year', years: 'years',
    generated: 'Generated on' },
};

const s = StyleSheet.create({
  page: { paddingTop: 92, paddingBottom: 70, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 10, color: '#1f2933', lineHeight: 1.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, height: 64 },
  headerImg: { width: '100%', height: 64, objectFit: 'cover' },
  band: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 44, gap: 12, backgroundColor: '#ffffff', borderBottomWidth: 4 },
  bandLogo: { height: 34, maxWidth: 160, objectFit: 'contain' },
  bandName: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  footerBox: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40 },
  footerImg: { width: '100%', height: 40, objectFit: 'cover' },
  foot: { position: 'absolute', bottom: 22, left: 44, right: 44, fontSize: 8, color: '#6b7280' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  photo: { width: 64, height: 64, borderRadius: 32, objectFit: 'cover' },
  name: { fontSize: 18, fontFamily: 'Helvetica-Bold', lineHeight: 1.25, marginBottom: 2 },
  headline: { fontSize: 11, marginTop: 2 },
  muted: { color: '#6b7280' },
  section: { marginTop: 12 },
  h2: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', paddingBottom: 3, marginBottom: 6, borderBottomWidth: 1.2 },
  para: { textAlign: 'justify' },
  item: { marginBottom: 7 },
  bold: { fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  bullet: { flexDirection: 'row', marginBottom: 2 },
  dot: { width: 10 },
});

function fmtMonth(iso: string | undefined, lang: CvLang, yearOnly = false) {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (yearOnly) return String(d.getUTCFullYear());
  const m = d.toLocaleDateString(lang === 'es' ? 'es-PE' : 'en-US', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getUTCFullYear()}`;
}
const range = (start: string | undefined, end: string | undefined, current: boolean, lang: CvLang, yearOnly = false) =>
  [fmtMonth(start, lang, yearOnly), current ? L[lang].present : fmtMonth(end, lang, yearOnly)].filter(Boolean).join(' - ');

export function CvDocument({ data, tpl, lang, generatedAt }: { data: CvData; tpl: CvTemplate; lang: CvLang; generatedAt: Date }) {
  const l = L[lang];
  const sections: { title: string; body: React.ReactNode }[] = [];
  if (data.experiences.length) sections.push({ title: l.experience, body: data.experiences.map((e, i) => (
    <View key={i} style={s.item} wrap={false}>
      <Text style={s.bold}>{e.company}</Text>
      <View style={s.row}><Text>{e.position}</Text><Text style={s.muted}>{range(e.start, e.end, e.current, lang)}</Text></View>
      {e.functions ? <Text style={[s.para, s.muted]}>{e.functions}</Text> : null}
    </View>
  )) });
  const edu = (list: CvEducation[]) => list.map((e, i) => (
    <View key={i} style={s.item} wrap={false}>
      <Text style={s.bold}>{e.institution}</Text>
      <View style={s.row}><Text>{[e.career, e.grade].filter(Boolean).join(' - ')}</Text>
        <Text style={s.muted}>{range(e.start, e.end, e.current, lang, e.yearOnly)}</Text></View>
    </View>
  ));
  if (data.educations.length) sections.push({ title: l.education, body: edu(data.educations) });
  if (data.certifications.length) sections.push({ title: l.certifications, body: edu(data.certifications) });
  if (data.tech.length) sections.push({ title: l.tech, body: data.tech.map((t, i) => (
    <View key={i} style={s.bullet}><Text style={s.dot}>•</Text><Text>{t.name}{t.years > 0 ? ` - ${t.years} ${t.years === 1 ? l.year : l.years}` : ''}</Text></View>
  )) });
  if (data.soft.length) sections.push({ title: l.soft, body: data.soft.map((t, i) => (
    <View key={i} style={s.bullet}><Text style={s.dot}>•</Text><Text>{t}</Text></View>
  )) });
  if (data.languages.length) sections.push({ title: l.languages, body: data.languages.map((t, i) => (
    <View key={i} style={s.bullet}><Text style={s.dot}>•</Text><Text>{t.name} - {t.level}</Text></View>
  )) });

  const stamp = generatedAt.toLocaleDateString(lang === 'es' ? 'es-PE' : 'en-US', { day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <Document title={`${data.name} - CV`} author={tpl.displayName} language={lang}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {tpl.header
            ? <Image src={tpl.header} style={s.headerImg} />
            : <View style={[s.band, { borderBottomColor: tpl.colorPrimary }]}>
                {tpl.logo ? <Image src={tpl.logo} style={s.bandLogo} /> : <Text style={[s.bandName, { color: tpl.colorPrimary }]}>{tpl.displayName}</Text>}
              </View>}
        </View>

        <View style={s.top}>
          {tpl.showPhoto && data.photo ? <Image src={data.photo} style={s.photo} /> : null}
          <View>
            <Text style={[s.name, { color: tpl.colorPrimary }]}>{data.name}</Text>
            {data.headline ? <Text style={s.headline}>{data.headline}</Text> : null}
            {data.location ? <Text style={s.muted}>{data.location}</Text> : null}
          </View>
        </View>
        {data.summary ? (
          <View style={s.section}>
            <Text style={[s.h2, { color: tpl.colorPrimary, borderBottomColor: tpl.colorSecondary }]}>{l.profile}</Text>
            <Text style={s.para}>{data.summary}</Text>
          </View>
        ) : null}
        {sections.map((sec, i) => (
          <View key={sec.title} style={s.section}>
            <Text style={[s.h2, { color: tpl.colorPrimary, borderBottomColor: tpl.colorSecondary }]} minPresenceAhead={40}>{i + 1}. {sec.title}</Text>
            {sec.body}
          </View>
        ))}

        {tpl.footer ? <View style={s.footerBox} fixed><Image src={tpl.footer} style={s.footerImg} /></View> : null}
        <Text style={[s.foot, tpl.footer ? { bottom: 46 } : {}]} fixed>{[tpl.footerText || tpl.displayName, `${l.generated}: ${stamp}`].join('  |  ')}</Text>
      </Page>
    </Document>
  );
}
