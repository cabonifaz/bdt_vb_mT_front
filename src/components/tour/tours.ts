// Contenido de las guías de primer uso, por pantalla. Cada paso señala un elemento (selector CSS; sin selector se
// muestra centrado) y puede traer un ejemplo. Los pasos cuyo elemento no está en pantalla (p. ej. por permisos) se
// omiten. Subir "version" vuelve a mostrar la guía a todos (o publicarla como novedad desde el Super Admin).
export type TourStep = { target?: string; title: Record<'es' | 'en', string>; body: Record<'es' | 'en', string>; example?: Record<'es' | 'en', string> };
export type Tour = { key: string; version: number; steps: TourStep[] };

const s = (target: string | undefined, es: [string, string, string?], en: [string, string, string?]): TourStep => ({
  target, title: { es: es[0], en: en[0] }, body: { es: es[1], en: en[1] },
  example: es[2] ? { es: es[2], en: en[2] ?? es[2] } : undefined,
});

const HELP = s('[data-testid="help-button"]',
  ['Ayuda en cada pantalla', 'Con este botón vuelves a ver la guía de la pantalla en la que estás, cuando quieras.'],
  ['Help on every screen', 'Use this button to see the guide for the current screen again, anytime.']);
const REPORT = s('[data-testid="report-button"]',
  ['¿Algo no funciona o tienes una idea?', 'Reporta incidencias, observaciones o mejoras al equipo de la plataforma. Se guarda automáticamente desde qué pantalla lo envías y puedes adjuntar capturas. Te avisamos cuando haya respuesta.',
    'Ej.: «Incidencia · Al guardar el RQ sale un error» + captura de pantalla.'],
  ['Something wrong or have an idea?', 'Report incidents, observations or improvements to the platform team. The screen you send it from is saved automatically and you can attach screenshots. We notify you when there is a reply.',
    'E.g. "Incident · Saving the requirement shows an error" + a screenshot.']);

export const TOURS: Record<string, Tour> = {
  home: { key: 'home', version: 1, steps: [
    s(undefined, ['Bienvenido al Banco de Talentos', 'Esta guía te muestra en un minuto lo principal. Cada módulo tiene su propia guía la primera vez que entras.'],
      ['Welcome to Talent Bank', 'This guide shows you the essentials in a minute. Each module has its own guide the first time you open it.']),
    s('aside', ['El menú', 'Desde aquí vas a Talentos, Requerimientos, Favoritos, Entrevistas y Lista negra. Lo que ves depende de tu rol.'],
      ['The menu', 'From here you reach Talents, Requirements, Favorites, Interviews and Blacklist. What you see depends on your role.']),
    s('[data-testid="home-kpis"]', ['Tu resumen', 'Indicadores del día: talentos, entrevistas y requerimientos que requieren atención.'],
      ['Your summary', 'Today\'s indicators: talents, interviews and requirements that need attention.']),
    s('[data-testid="notif-bell"]', ['Notificaciones', 'Te avisamos de nuevos talentos, cambios en requerimientos, respuestas a tus solicitudes y novedades. Si instalas la app, también llegan como notificación del sistema.'],
      ['Notifications', 'We notify you about new talents, requirement changes, replies to your requests and what\'s new. If you install the app, they also arrive as system notifications.']),
    REPORT, HELP,
  ] },
  talents: { key: 'talents', version: 1, steps: [
    s('[data-testid="quick-talent"]', ['Carga rápida con CV', 'Sube el PDF del CV y la IA completa los datos, experiencias, estudios, idiomas y años por tecnología. Si el talento ya existe (por correo, DNI o nombre), solo se actualiza: no se duplica.',
      'Ej.: arrastra «CV_Juan_Perez.pdf», revisa celular y correo, y guarda.'],
      ['Quick load from a CV', 'Upload the CV PDF and AI fills in the data, experience, education, languages and years per technology. If the talent already exists (by email, ID or name), it is only updated: no duplicates.',
        'E.g. drop "CV_Juan_Perez.pdf", check phone and email, and save.']),
    s('[data-testid="new-talent"]', ['Alta manual', 'Registra un talento completando el formulario (también puedes leer un CV desde ahí).'],
      ['Manual entry', 'Register a talent by filling in the form (you can also read a CV from there).']),
    s('.content input[type="search"]', ['Búsqueda', 'Busca por nombre, puesto o tecnología.', 'Ej.: «java senior» o «perforista».'],
      ['Search', 'Search by name, role or technology.', 'E.g. "java senior" or "driller".']),
    s('[data-testid="toggle-filters"]', ['Filtros', 'Afina por habilidades, años, idiomas, disponibilidad y más. Los filtros no se guardan en el enlace.'],
      ['Filters', 'Narrow down by skills, years, languages, availability and more. Filters are not stored in the link.']),
    s('[data-testid="talent-card"], [data-testid="talent-row-name"]', ['La ficha del talento', 'Haz clic para ver su ficha: datos, experiencia, CV con la marca de la empresa, postulaciones y entrevistas.'],
      ['The talent profile', 'Click to open the profile: data, experience, branded CV, applications and interviews.']),
  ] },
  'talent-detail': { key: 'talent-detail', version: 1, steps: [
    s('[data-testid="talent-name"]', ['Ficha del talento', 'Todo lo del talento en un solo lugar. La cabecera queda fija al desplazarte.'],
      ['Talent profile', 'Everything about the talent in one place. The header stays visible while you scroll.']),
    s('[data-testid="edit-talent"]', ['Editar o releer el CV', 'Edita en un modal. Si subes un CV nuevo, la IA agrega lo nuevo y actualiza los años por tecnología.'],
      ['Edit or re-read the CV', 'Edit in a modal. If you upload a new CV, AI adds what is new and updates the years per technology.']),
    s('[data-testid="talent-application"]', ['Postulaciones', 'Los requerimientos donde participa y su etapa. Si renunció, lo verás marcado.'],
      ['Applications', 'Requirements the talent is in and their stage. If they resigned, it is flagged.']),
    s('[data-testid="file-row"]', ['Archivos', 'CV original, CV con la marca de la empresa y otros documentos.'],
      ['Files', 'Original CV, branded CV and other documents.']),
  ] },
  'rq-board': { key: 'rq-board', version: 1, steps: [
    s('[data-testid="rq-scopes"]', ['Vistas del tablero', 'Por defecto ves solo lo abierto y sin vencer. Cambia a Por vencer, Vencidos, Nuevos, Cerrados o Todos; cada pestaña muestra cuántos hay.',
      'Ej.: «Por vencer» muestra los que vencen hoy o en los próximos 3 días.'],
      ['Board views', 'By default you see only open, not overdue requirements. Switch to Due soon, Overdue, New, Closed or All; each tab shows a count.',
        'E.g. "Due soon" shows those due today or in the next 3 days.']),
    s('[data-testid="rq-search"]', ['Búsqueda', 'Por código, título, cliente, contacto del cliente o perfil.', 'Ej.: «RQ-2026-0012» o «perforista».'],
      ['Search', 'By code, title, client, client contact or profile.', 'E.g. "RQ-2026-0012" or "driller".']),
    s('[data-testid="rq-filter-client"]', ['Cliente y contacto', 'Filtra por cliente; al elegirlo aparece el filtro por su contacto. También hay filtro por perfil y «Solo míos».'],
      ['Client and contact', 'Filter by client; once chosen, a filter by its contact appears. There are also profile and "Only mine" filters.']),
    s('[data-testid="rq-board"]', ['El Kanban', 'Cada columna es un estado. Arrastra una tarjeta para cambiarla de estado, o usa el menú «⋯». Al soltar en Cerrados se elige el motivo.',
      'Ej.: arrastra un RQ de «Registrado» a «Asignado» cuando ya tenga analistas.'],
      ['The Kanban', 'Each column is a status. Drag a card to change its status, or use the "⋯" menu. Dropping on Closed asks for the reason.',
        'E.g. drag a requirement from "Registered" to "Assigned" once it has analysts.']),
    s('[data-testid="rq-new"]', ['Nuevo requerimiento', 'Lo crean el jefe de selección, el comercial y el admin: datos, vacantes, contactos, bandas y documentos que se pedirán.'],
      ['New requirement', 'Created by the selection lead, sales and admin: data, openings, contacts, bands and the documents applicants must submit.']),
    HELP,
  ] },
  'rq-detail': { key: 'rq-detail', version: 1, steps: [
    s('.rq-head', ['El requerimiento', 'Código, cliente, vencimiento, vacantes cubiertas y responsables (puede haber varios analistas).'],
      ['The requirement', 'Code, client, due date, filled openings and owners (there can be several analysts).']),
    s('[data-testid="rq-pipeline"]', ['Pipeline de candidatos', 'Arrastra a cada postulante por las etapas. Para confirmar debe tener al menos datos completos y haber cupo en la vacante.',
      'Ej.: Observado → Datos completos → En entrevista → Confirmado.'],
      ['Candidate pipeline', 'Drag each applicant through the stages. To confirm, they must have at least complete data and an available opening.',
        'E.g. Observed → Data complete → Interview → Confirmed.']),
    s('[data-testid="rq-add-candidate"]', ['Agregar candidatos', 'Busca en el banco y elige la vacante. Se avisa si el talento está en lista negra.'],
      ['Add candidates', 'Search the bank and pick the opening. You are warned if the talent is blacklisted.']),
    s('[data-testid="doc-meter"]', ['Documentos del postulante', 'Una barrita por documento obligatorio: verde verificado, ámbar por revisar, rojo rechazado o vencido, gris falta.',
      'Ej.: «1/2» = uno de dos obligatorios verificado.'],
      ['Applicant documents', 'One bar per required document: green verified, amber to review, red rejected or expired, grey missing.',
        'E.g. "1/2" = one of two required documents verified.']),
    s('[data-testid="cand-open"]', ['Ficha del postulante', 'Al hacer clic en el nombre ves sus documentos (cargar, aprobar o rechazar; el CUL se valida solo contra el MTPE) y la línea de tiempo de su proceso.'],
      ['Applicant sheet', 'Click the name to see their documents (upload, approve or reject; the CUL is checked automatically with the MTPE) and their process timeline.']),
    s('[data-testid="rq-reopen"]', ['Reabrir', 'Solo el jefe de selección reabre un RQ cerrado: por renuncia (indicando quién renunció) o por más vacantes.'],
      ['Reopen', 'Only the selection lead reopens a closed requirement: due to a resignation (saying who resigned) or more openings.']),
  ] },
  favorites: { key: 'favorites', version: 1, steps: [
    s('[data-testid="new-collection"]', ['Colecciones de favoritos', 'Agrupa talentos en colecciones para un cliente o una búsqueda.', 'Ej.: «Shortlist Antamina – perforistas».'],
      ['Favorite collections', 'Group talents into collections for a client or a search.', 'E.g. "Antamina shortlist – drillers".']),
    s('[data-testid="collection-row"]', ['Tus colecciones', 'Ábrelas para ver y quitar talentos.'], ['Your collections', 'Open them to see and remove talents.']),
    s('[data-testid="share-collection"]', ['Compartir', 'Comparte una colección con colegas para trabajar juntos.'], ['Share', 'Share a collection with colleagues to work together.']),
  ] },
  interviews: { key: 'interviews', version: 1, steps: [
    s('[data-testid="new-interview"]', ['Agendar entrevista', 'Registra la entrevista con fecha, modalidad y entrevistadores.'], ['Schedule an interview', 'Record the interview with date, mode and interviewers.']),
    s('[data-testid="iv-row"]', ['Entrevistas', 'Ábrela para registrar el resultado y las respuestas.'], ['Interviews', 'Open it to record the result and answers.']),
    s('[data-testid="iv-ics"]', ['Calendario', 'Descarga el evento para tu calendario.'], ['Calendar', 'Download the event for your calendar.']),
  ] },
  blacklist: { key: 'blacklist', version: 1, steps: [
    s('[data-testid="bl-new"]', ['Lista negra', 'Restringe a un talento para todos los clientes o solo para algunos, con el motivo.'], ['Blacklist', 'Restrict a talent for all clients or only some, with the reason.']),
    s('[data-testid="bl-row"]', ['Restricciones', 'Edita o libera clientes cuando corresponda.'], ['Restrictions', 'Edit or release clients when appropriate.']),
  ] },
  documents: { key: 'documents', version: 1, steps: [
    s('[data-testid="doc-rules"]', ['Documentos de postulación', 'Define qué documentos se piden por defecto, si se reutilizan entre RQ, su vigencia y cómo se validan. Cada RQ puede ajustarlo.',
      'Ej.: CUL obligatorio, reutilizable, 90 días, validación automática (MTPE).'],
      ['Application documents', 'Define which documents are requested by default, whether they are reused across requirements, their validity and how they are checked. Each requirement can adjust this.',
        'E.g. CUL required, reusable, 90 days, automatic check (MTPE).']),
    s('[data-testid="doc-type-new"]', ['Tipos propios', 'Agrega documentos propios de la empresa.', 'Ej.: «Certificado de altura».'], ['Own types', 'Add your company\'s own document types.', 'E.g. "Working at heights certificate".']),
  ] },
  support: { key: 'support', version: 1, steps: [
    s('[data-testid="support-list"]', ['Tus solicitudes', 'Aquí sigues tus incidencias, observaciones y mejoras: su estado y la conversación con el equipo de la plataforma.'],
      ['Your requests', 'Follow your incidents, observations and improvements here: their status and the conversation with the platform team.']),
    REPORT,
  ] },
  news: { key: 'news', version: 1, steps: [
    s('[data-testid="release-list"]', ['Novedades', 'Lo nuevo de la plataforma. Algunas novedades traen su guía: ábrela desde aquí.'], ['What\'s new', 'New in the platform. Some items include their guide: open it from here.']),
  ] },
  'admin-home': { key: 'admin-home', version: 1, steps: [
    s(undefined, ['Consola del Super Admin', 'Administras empresas (tenants), aprobaciones de API, consumo, soporte y novedades.'],
      ['Super Admin console', 'You manage companies (tenants), API approvals, usage, support and what\'s new.']),
    s('aside', ['Menú', 'Soporte reúne las solicitudes de todos los usuarios; Novedades publica avisos para todos.'],
      ['Menu', 'Support gathers requests from all users; What\'s new publishes announcements to everyone.']),
    s('[data-testid="notif-bell"]', ['Notificaciones', 'Te avisamos de cada solicitud nueva y de cada respuesta de los usuarios.'],
      ['Notifications', 'You are notified of every new request and every user reply.']),
    HELP,
  ] },
  'admin-support': { key: 'admin-support', version: 1, steps: [
    s('[data-testid="support-filters"]', ['Bandeja de soporte', 'Filtra por estado o busca por número, título o empresa. Primero aparecen las abiertas.'],
      ['Support inbox', 'Filter by status or search by number, title or company. Open ones come first.']),
    s('[data-testid="support-list"]', ['Atender', 'Abre una solicitud para ver de qué pantalla vino, sus imágenes y referencias, responder y cambiar su estado. El usuario recibe la notificación.',
      'Ej.: «En atención» mientras lo revisas; «Respondida» con la solución; «Cerrada» al terminar.'],
      ['Handle', 'Open a request to see the screen it came from, its images and references, reply and change its status. The user is notified.',
        'E.g. "In progress" while reviewing; "Answered" with the fix; "Closed" when done.']),
  ] },
  'admin-news': { key: 'admin-news', version: 1, steps: [
    s('[data-testid="release-new"]', ['Publicar una novedad', 'Escribe la novedad (español e inglés). Se notifica a todos los usuarios. Si eliges una pantalla con guía, esa guía se vuelve a mostrar a todos.'],
      ['Publish what\'s new', 'Write the announcement (Spanish and English). All users are notified. If you pick a screen with a guide, that guide is shown again to everyone.']),
  ] },
};

/** Guía de la pantalla actual según la ruta. */
export function tourForPath(pathname: string, platform: boolean): string | null {
  const p = pathname.split('/').filter(Boolean);
  if (platform) {
    const seg = p[1] ?? '';
    return seg === '' || seg === 'tenants' ? 'admin-home' : seg === 'soporte' ? 'admin-support' : seg === 'novedades' ? 'admin-news' : null;
  }
  const [, seg = '', id] = p;
  const map: Record<string, string> = { '': 'home', talentos: id ? 'talent-detail' : 'talents', requerimientos: id ? 'rq-detail' : 'rq-board',
    favoritos: 'favorites', entrevistas: 'interviews', 'lista-negra': 'blacklist', documentos: 'documents', soporte: 'support', novedades: 'news' };
  if (seg === 'soporte' && id) return null;
  return map[seg] ?? null;
}

/** Pantallas que se pueden asociar a una novedad (para abrirla y relanzar su guía). */
export const RELEASE_MODULES: { module: string; tour: string; path: string }[] = [
  { module: 'talents', tour: 'talents', path: 'talentos' }, { module: 'requirements', tour: 'rq-board', path: 'requerimientos' },
  { module: 'requirement-detail', tour: 'rq-detail', path: 'requerimientos' }, { module: 'favorites', tour: 'favorites', path: 'favoritos' },
  { module: 'interviews', tour: 'interviews', path: 'entrevistas' }, { module: 'blacklist', tour: 'blacklist', path: 'lista-negra' },
  { module: 'documents', tour: 'documents', path: 'documentos' }, { module: 'home', tour: 'home', path: '' },
];
