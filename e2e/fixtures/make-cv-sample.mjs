// Genera e2e/fixtures/cv-sample.pdf: CV ficticio con el formato típico de una consultora (cabecera gráfica a todo el
// ancho, nombre centrado, títulos numerados sin línea, puesto y fechas en negrita, pie en recuadro gris).
// Uso: node e2e/fixtures/make-cv-sample.mjs
import { createElement as h } from 'react';
import { Document, Page, Text, View, renderToFile } from '@react-pdf/renderer';

const bold = { fontFamily: 'Helvetica-Bold' };
const row = { flexDirection: 'row', justifyContent: 'space-between' };
const doc = h(Document, null,
  h(Page, { size: 'A4', style: { paddingTop: 90, paddingBottom: 70, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 10 } },
    h(View, { fixed: true, style: { position: 'absolute', top: 0, left: 0, right: 0, height: 62, backgroundColor: '#1E5BB8', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 30 } },
      h(View, { style: { width: 120, height: 30, backgroundColor: '#F5A623' } })),
    h(Text, { style: { ...bold, fontSize: 18, textAlign: 'center', color: '#111111', marginBottom: 8 } }, 'Lucía Fernández Prado'),
    h(Text, null, 'Ingeniera de software con 10 años de experiencia en sistemas financieros y equipos ágiles.'),
    h(Text, { style: { ...bold, fontSize: 13, marginTop: 16, marginBottom: 6 } }, '1. Experiencia laboral'),
    h(Text, { style: bold }, 'Empresa Ejemplo SAC'),
    h(View, { style: row }, h(Text, { style: bold }, 'Analista Programadora'), h(Text, { style: bold }, 'Mar 2020 - Sept 2025')),
    h(Text, null, 'Desarrollo de microservicios y pruebas automatizadas.'),
    h(Text, { style: { ...bold, fontSize: 13, marginTop: 16, marginBottom: 6 } }, '2. Educación'),
    h(Text, { style: bold }, 'Universidad Ejemplo'),
    h(Text, null, 'Ingeniería de Sistemas - Bachiller 2008 - 2013'),
    h(Text, { fixed: true, style: { position: 'absolute', bottom: 18, left: 40, right: 40, paddingVertical: 9, borderRadius: 4, backgroundColor: '#F3F4F6', textAlign: 'center', fontSize: 8, color: '#6B7280' } },
      'Generado con ACME © 2025  |  Fecha de generación: 25 de septiembre de 2026')));

await renderToFile(doc, new URL('./cv-sample.pdf', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
console.log('ok');
