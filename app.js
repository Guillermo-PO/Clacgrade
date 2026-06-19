// ══════════════════════════════════════════════════════
//  GradeCalc — app.js
//  Requiere: Supabase SDK global (_supa) definido en config.js
// ══════════════════════════════════════════════════════
const SUPABASE_URL = 'https://ufnnfdetjuwpslghfwsj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OcepqCt9RKxv-RNiYvrhcw_DWWRL5Qy';
const _supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Frases motivacionales ───────────────────────────
const QUOTES = [
  { texto: 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.', autor: 'Robert Collier' },
  { texto: 'No estudies para aprobar. Estudia para saber.', autor: 'Anónimo' },
  { texto: 'La educación es el arma más poderosa que puedes usar para cambiar el mundo.', autor: 'Nelson Mandela' },
  { texto: 'Cada experto fue alguna vez un principiante.', autor: 'Helen Hayes' },
  { texto: 'Hoy es siempre el día más productivo de tu vida.', autor: 'Mark Twain' },
  { texto: 'No importa lo lento que avances, siempre y cuando no te detengas.', autor: 'Confucio' },
  { texto: 'El talento gana partidos, pero el trabajo en equipo y la inteligencia ganan campeonatos.', autor: 'Michael Jordan' },
  { texto: 'El aprendizaje nunca agota la mente.', autor: 'Leonardo da Vinci' },
  { texto: 'Un pequeño progreso cada día conduce a grandes resultados.', autor: 'Anónimo' },
  { texto: 'Invierte en ti mismo. Tu carrera es el motor de tu riqueza.', autor: 'Paul Clitheroe' },
  { texto: 'Las dificultades preparan a personas ordinarias para destinos extraordinarios.', autor: 'C.S. Lewis' },
  { texto: 'La única forma de hacer un gran trabajo es amar lo que haces.', autor: 'Steve Jobs' },
];

function getRandomQuote() { return QUOTES[Math.floor(Math.random() * QUOTES.length)]; }

// ── STATE ───────────────────────────────────────────
const State = {
  user: null, materias: [], historial: [], agenda: [], configIdx: 0,
  totalMaterias: 0, minPass: 6.0, activeMateria: 0, syncTimer: null,
};

// Paleta de colores para las materias
const PALETTE = ['#5d7bff', '#2ecc8a', '#f5a623', '#ff5f72', '#a78bfa', '#34d399', '#f472b6', '#fbbf24'];


// ── UTILS ───────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const fmt = (n, dec = 2) => isNaN(n) || n === null ? '—' : parseFloat(n).toFixed(dec);

function showScreen(id, animClass = null, pushToHistory = true) {
  document.querySelectorAll('.screen').forEach((s) => {
    s.classList.remove('active', 'slide-in-right', 'slide-in-left');
  });
  const target = $(id);
  if (target) {
    target.classList.add('active');
    if (animClass) target.classList.add(animClass);
  }
  
  const dots = $('swipe-dots');
  if (dots) {
    if (id === 's-dashboard' || id === 's-agenda') {
      dots.style.display = 'flex';
      $('dot-dash').classList.toggle('active', id === 's-dashboard');
      $('dot-agenda').classList.toggle('active', id === 's-agenda');
    } else {
      dots.style.display = 'none';
    }
  }

  // ── NUEVO: Guardar la ruta en el navegador ──
  if (pushToHistory && id !== 's-auth' && id !== 's-loading') {
    window.history.pushState({ screen: id }, '', `#${id}`);
  }
}

function toast(msg, dur = 2400) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}

function setSyncState(state) {
  const dot = $('sync-indicator'); if (!dot) return;
  dot.className = 'sync-dot ' + state;
  dot.title = state === 'synced' ? 'Sincronizado' : state === 'syncing' ? 'Guardando…' : 'Error al guardar';
}

function gradeClass(g) {
  if (g === null || isNaN(g)) return 'grade-empty';
  if (g >= State.minPass + 1.5) return 'grade-pass';
  if (g >= State.minPass) return 'grade-risk';
  return 'grade-fail';
}

function badgeForGrade(g) {
  if (g === null || isNaN(g)) return 'Sin datos';
  if (g >= State.minPass + 1.5) return '✓ Aprobado';
  if (g >= State.minPass) return '⚠ En riesgo';
  return '✗ Reprobado';
}

// ── SUPABASE DB ─────────────────────────────────────
const DB = {
  async load() {
    const localDataRaw = localStorage.getItem('calcgrade_data');
    const localData = localDataRaw ? JSON.parse(localDataRaw) : null;
    const needsSync = localStorage.getItem('calcgrade_needs_sync') === 'true';

    // Si hay internet...
    if (navigator.onLine) {
      // CASO A: Regresó el internet y tenemos datos offline pendientes de subir
      if (needsSync && localData) {
        console.log("Subiendo trabajo offline a la nube...");
        await this.save(localData); // Subimos lo local a Supabase
        return localData;
      }

      // CASO B: Flujo normal, descargamos la copia maestra de la nube
      try {
        const { data, error } = await _supa.from('profiles').select('data').eq('id', State.user.id).single();
        if (!error && data?.data) {
          localStorage.setItem('calcgrade_data', JSON.stringify(data.data)); // Respaldamos en el teléfono
          return data.data;
        }
      } catch (e) {
        console.warn("Sin respuesta de la nube...");
      }
    }
    
    // Si no hay internet o falló Supabase, mandamos lo del teléfono
    return localData;
  },

  async save(payload) {
    setSyncState('syncing');
    
    // Siempre guardamos en el teléfono primero (inmune a caídas)
    localStorage.setItem('calcgrade_data', JSON.stringify(payload));

    // Si no hay internet, prendemos la bandera para acordarnos de subirlo luego
    if (!navigator.onLine) {
      localStorage.setItem('calcgrade_needs_sync', 'true');
      setSyncState('synced'); 
      return true;
    }

    // Si sí hay internet, intentamos subirlo a Supabase
    try {
      const { error } = await _supa.from('profiles').upsert({
        id: State.user.id, 
        data: payload, 
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      
      // Subida exitosa: apagamos la bandera
      localStorage.removeItem('calcgrade_needs_sync');
      setSyncState('synced'); 
      return true;
    } catch (error) {
      // Si falló por alguna razón, encendemos la bandera
      localStorage.setItem('calcgrade_needs_sync', 'true');
      setSyncState('error'); 
      return false;
    }
  },
};

// Función para guardar automáticamente en segundo plano
function scheduleSave() {
  // Limpiamos cualquier guardado pendiente para no hacer peticiones dobles
  if (State.syncTimer) clearTimeout(State.syncTimer); 
  
  // Envolvemos el indicador visual en un try-catch para que no rompa botones offline
  try { 
    if (typeof setSyncState === 'function') setSyncState('syncing'); 
  } catch(e) { /* Silenciamos el error visual si no existe */ }
  
  // Programamos el guardado para dentro de un segundo
  State.syncTimer = setTimeout(async () => {
    try {
      await DB.save({ 
        materias: State.materias, 
        minPass: State.minPass, 
        historial: State.historial, 
        agenda: State.agenda 
      });
    } catch(e) {
      console.error("Error guardando datos de fondo:", e);
    }
  }, 1200);
}

// ── AUTH ────────────────────────────────────────────
const Auth = {
  currentTab: 'login', _initialized: false,
  async init() {
    const { data: { session } } = await _supa.auth.getSession();
    if (session?.user) {
      State.user = session.user; Auth._initialized = true; await Auth.afterLogin();
    } else {
      showScreen('s-auth'); Auth.renderQuote(); Auth.renderForm();
    }
    _supa.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        if (Auth._initialized && State.user && State.user.id === session.user.id) return;
        State.user = session.user; Auth._initialized = true; await Auth.afterLogin();
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user) State.user = session.user;
      } else if (event === 'SIGNED_OUT') {
        State.user = null; Auth._initialized = false; showScreen('s-auth'); Auth.renderForm();
      }
    });
  },
  renderQuote() {
    const q = getRandomQuote(); const el = $('auth-quote');
    if (el) el.innerHTML = `"${q.texto}" <br><span style="font-style:normal;color:var(--text3);font-size:11px">— ${q.autor}</span>`;
  },
  async afterLogin() {
    showScreen('s-loading', null, false); // El false evita que la pantalla de carga se guarde en el historial

    // ── NUEVO: Destruir el rastro del token de Google en la URL ──
    if (window.location.hash.includes('access_token') || window.location.search.includes('code')) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    const saved = await DB.load();
    if (saved) {
      State.materias = saved.materias || []; 
      State.historial = saved.historial || []; 
      State.agenda = saved.agenda || [];
      State.minPass = saved.minPass ?? 6.0;
    }
    
    const btn = $('btn-user-menu');
    if (btn) {
      btn.textContent = State.user.email?.split('@')[0] ?? 'Perfil';
      btn.style.display = 'inline-flex';
    }

    if (State.materias.length) {
      App.buildDashboard(); showScreen('s-dashboard');
    } else {
      showScreen('s-setup');
    }
  },
  switchTab(tab) {
    Auth.currentTab = tab;
    $('tab-login').classList.toggle('active', tab === 'login');
    $('tab-signup').classList.toggle('active', tab === 'signup');
    Auth.renderForm();
  },
  renderForm() {
    const isLogin = Auth.currentTab === 'login';
    $('auth-form-wrap').innerHTML = `
      <div class="field">
        <label>Correo electrónico</label>
        <input type="email" id="auth-email" placeholder="tu@correo.com" autocomplete="email">
      </div>
      <div class="field">
        <label>Contraseña</label>
        <input type="password" id="auth-pass" placeholder="••••••••" autocomplete="${isLogin ? 'current-password' : 'new-password'}" onkeydown="if(event.key==='Enter') Auth.submit()">
      </div>
      <button class="btn btn-full" onclick="Auth.submit()">${isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</button>
    `;
  },
  async submit() {
    const email = $('auth-email')?.value?.trim(); const pass = $('auth-pass')?.value;
    const err = $('auth-err'); err.classList.remove('show');
    if (!email || !pass) { err.textContent = 'Completa todos los campos.'; err.classList.add('show'); return; }
    if (pass.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; err.classList.add('show'); return; }
    if (Auth.currentTab === 'signup') {
      const { data, error } = await _supa.auth.signUp({ email, password: pass });
      if (error) { err.textContent = error.message; err.classList.add('show'); return; }
      if (!data.session) { err.style.color = 'var(--green)'; err.textContent = '✓ Revisa tu correo para confirmar tu cuenta.'; err.classList.add('show'); }
      return;
    }
    const { error } = await _supa.auth.signInWithPassword({ email, password: pass });
    if (error) { err.textContent = error.message; err.classList.add('show'); }
  },
  async loginGoogle() {
    const btn = document.querySelector('.btn-google');
    if (btn) { btn.disabled = true; btn.textContent = 'Conectando…'; }
    Auth._initialized = false;
    const redirectTo = window.location.origin + '/';
    const { error } = await _supa.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { access_type: 'offline', prompt: 'consent' } } });
    if (error) {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Continuar con Google'; }
      const errEl = document.getElementById('auth-err');
      if (errEl) { errEl.textContent = 'Error Google: ' + error.message; errEl.classList.add('show'); }
    }
  },
  async logout() {
    Auth.closeUserMenu(); await _supa.auth.signOut(); State.materias = []; Auth._initialized = false;
    
    const btn = $('btn-user-menu'); 
    if (btn) btn.style.display = 'none'; 
    
    showScreen('s-auth'); Auth.renderForm(); toast('Sesión cerrada');
  },
  showUserMenu() {
    const emailEl = $('menu-email');
    const menuEl = $('user-menu');
    if (emailEl) emailEl.textContent = State.user?.email ?? '';
    if (menuEl) menuEl.style.display = 'block';
  },
  closeUserMenu() {
    const menuEl = $('user-menu');
    if (menuEl) menuEl.style.display = 'none';
  },
};

// ── CALC ENGINE ─────────────────────────────────────
const Calc = {
  _round(val, mat) {
    if (val === null) return null;
    if (!mat.redondeo || val < State.minPass) return val;
    
    const intPart = Math.floor(val);
    const decPart = val - intPart;
    const umbral = parseFloat(mat.redondeoUmbral) || 0.5;
    
    return decPart >= umbral ? intPart + 1 : intPart;
  },
  rubroAvg(r) {
    const v = r.calificaciones.map((x) => parseFloat(x)).filter((x) => !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  },
  materiaAvg(mat) {
    let total = 0, covered = 0;
    mat.rubros.forEach((r) => {
      const a = Calc.rubroAvg(r);
      if (a !== null) { total += a * (r.porcentaje / 100); covered += r.porcentaje / 100; }
    });
    const rawAvg = covered ? total / covered : null;
    return Calc._round(rawAvg, mat);
  },
  materiaTotal(mat) {
    const rawTotal = mat.rubros.reduce((s, r) => s + (Calc.rubroAvg(r) ?? 0) * (r.porcentaje / 100), 0);
    return Calc._round(rawTotal, mat);
  },
  predictPerRubro(mat) {
    const pass = State.minPass;
    return mat.rubros.map((r, ri) => {
      const pend = r.pendientes ?? 0;
      const wi = r.porcentaje / 100;
      const existingGrades = r.calificaciones.map((x) => parseFloat(x)).filter((x) => !isNaN(x));
      const existingCount = existingGrades.length;
      const sumExist = existingGrades.reduce((s, x) => s + x, 0);
      let securedOthers = 0;
      mat.rubros.forEach((rr, rri) => {
        if (rri === ri) return;
        const a = Calc.rubroAvg(rr);
        if (a !== null) securedOthers += a * (rr.porcentaje / 100);
      });
      let neededX = null;
      if (pend > 0) {
        neededX = (((pass - securedOthers) * (existingCount + pend)) / wi - sumExist) / pend;
      }
      return { rubro: r, ri, pend, existingCount, neededX };
    });
  },
};

// ── AGENDA MODULE ───────────────────────────
const Agenda = {
  view: 'list', currentDate: new Date(), selectedDate: new Date(),
  openAgenda() { showScreen('s-agenda', 'slide-in-right'); this.render(); },
  switchView(v) {
    this.view = v;
    $('btn-view-agenda').classList.toggle('active', v === 'list');
    $('btn-view-cal').classList.toggle('active', v === 'calendar');
    $('agenda-list-view').style.display = v === 'list' ? 'block' : 'none';
    $('agenda-cal-view').style.display = v === 'calendar' ? 'block' : 'none';
    this.render();
  },
  render() { if (this.view === 'list') this.renderList(); else this.renderCalendar(); },
  renderList() {
    const list = $('agenda-list-view'); let html = '';
    const pending = State.agenda.filter(e => !e.completado).sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
    const done = State.agenda.filter(e => e.completado).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    
    if (!pending.length && !done.length) {
      list.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text3);"><div style="font-size:32px; margin-bottom:10px;">☕</div><p>Tu agenda está libre.</p></div>`; return;
    }
    pending.forEach(e => html += this.buildEventCard(e));
    if (done.length > 0) {
      html += `<h3 style="font-size:13px; color:var(--text3); margin:24px 0 12px; text-transform:uppercase; letter-spacing:1px;">Completados</h3>`;
      done.forEach(e => html += this.buildEventCard(e));
    }
    list.innerHTML = html;
  },
  buildEventCard(e) {
    const mat = State.materias[e.materiaIdx]; const color = mat?.color || 'var(--border)';
    const dateParts = e.fecha.split('-');
    const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dateStr = dateObj.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    return `
      <div class="ev-card ${e.completado ? 'done' : ''}" style="border-left-color:${color};">
        <div class="ev-info">
          <div class="ev-title" style="${e.completado ? 'text-decoration:line-through;' : ''}">${e.titulo}</div>
          <div class="ev-meta"><span style="color:${color}; font-weight:500;">${mat?.nombre || 'Materia Eliminada'}</span><span>•</span><span>${e.tipo}</span><span>•</span><span>📅 ${dateStr}</span></div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-icon" style="color:var(--text); background:${e.completado ? 'var(--green-bg)' : 'var(--bg3)'};" onclick="Agenda.toggleDone('${e.id}')">${e.completado ? '✓' : '○'}</button>
          <button class="btn-icon" style="color:var(--red);" onclick="Agenda.deleteEvent('${e.id}')">🗑</button>
        </div>
      </div>
    `;
  },
  changeMonth(dir) { this.currentDate.setMonth(this.currentDate.getMonth() + dir); this.renderCalendar(); },
  renderCalendar() {
    const year = this.currentDate.getFullYear(); const month = this.currentDate.getMonth();
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    $('cal-month-year').textContent = `${monthNames[month]} ${year}`;
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    let gridHtml = ''; for (let i = 0; i < firstDay; i++) gridHtml += `<div class="cal-day empty"></div>`;
    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      const isSelected = d === this.selectedDate.getDate() && month === this.selectedDate.getMonth() && year === this.selectedDate.getFullYear();
      const dayEvents = State.agenda.filter(e => e.fecha === dateStr && !e.completado);
      let dotsHtml = '';
      if (dayEvents.length > 0) {
        dotsHtml = '<div class="cal-dots">';
        dayEvents.slice(0, 3).forEach(e => { dotsHtml += `<div class="cal-dot" style="background:${State.materias[e.materiaIdx]?.color || 'var(--accent)'};"></div>`; });
        dotsHtml += '</div>';
      }
      gridHtml += `<div class="cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="Agenda.selectDate(${year}, ${month}, ${d})">${d}${dotsHtml}</div>`;
    }
    $('cal-grid').innerHTML = gridHtml; this.renderSelectedDateEvents();
  },
  selectDate(y, m, d) { this.selectedDate = new Date(y, m, d); this.renderCalendar(); },
  renderSelectedDateEvents() {
    const dateStr = `${this.selectedDate.getFullYear()}-${String(this.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(this.selectedDate.getDate()).padStart(2, '0')}`;
    const displayDate = this.selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    $('cal-selected-date').textContent = displayDate.charAt(0).toUpperCase() + displayDate.slice(1);
    const dayEvents = State.agenda.filter(e => e.fecha === dateStr);
    if (!dayEvents.length) { $('cal-selected-events').innerHTML = '<p style="font-size:13px; color:var(--text3);">No hay eventos este día.</p>'; return; }
    let html = ''; dayEvents.forEach(e => html += this.buildEventCard(e)); $('cal-selected-events').innerHTML = html;
  },
  openAddEvent() {
    if (!State.materias.length) { toast('Agrega una materia primero'); return; }
    $('ev-title').value = ''; const dateStr = `${this.selectedDate.getFullYear()}-${String(this.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(this.selectedDate.getDate()).padStart(2, '0')}`;
    $('ev-date').value = dateStr; $('ev-materia').innerHTML = State.materias.map((m, i) => `<option value="${i}">${m.nombre || 'Materia ' + (i+1)}</option>`).join('');
    $('add-event-modal').classList.remove('hidden');
  },
  closeAddEvent(e) { if (e && e.target !== $('add-event-modal')) return; $('add-event-modal').classList.add('hidden'); },
  saveEvent() {
    const title = $('ev-title').value.trim(); if (!title) { toast('Agrega un título'); return; }
    State.agenda.push({ id: Date.now().toString(), titulo: title, materiaIdx: parseInt($('ev-materia').value), tipo: $('ev-type').value, fecha: $('ev-date').value, completado: false });
    scheduleSave(); this.closeAddEvent(); this.render();
    const widget = $('dash-agenda-widget'); if(widget) widget.style.display = 'block'; 
    toast('Guardado en Agenda');
  },
  toggleDone(id) { const ev = State.agenda.find(e => e.id === id); if (ev) ev.completado = !ev.completado; scheduleSave(); this.render(); },
  deleteEvent(id) { State.agenda = State.agenda.filter(e => e.id !== id); scheduleSave(); this.render(); }
};

// ── APP ─────────────────────────────────────────────
let analyticsChartInstance = null;
const App = {
  _activeMatColor: PALETTE[0],

initSwipes() {
    let touchStartX = 0;
    let touchEndX = 0;
    
    // Solo permitimos swipe entre estas dos pantallas
    const swipeScreens = ['s-dashboard', 's-agenda']; 

    document.addEventListener('touchstart', e => {
      // Si tocas un input, botón o tarjeta, no hacemos nada
      if (e.target.closest('input, textarea, button, .rubro-grade-row')) return;
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (e.target.closest('input, textarea, button, .rubro-grade-row')) return;
      touchEndX = e.changedTouches[0].screenX;
      
      const currentActive = document.querySelector('.screen.active');
      if (!currentActive) return;
      
      const currentIndex = swipeScreens.indexOf(currentActive.id);
      if (currentIndex === -1) return; // Si estamos en analíticas o materia, bloqueamos el swipe

      const diff = touchStartX - touchEndX;

      // Si deslizaste más de 50px a la izquierda o derecha, cambiamos de pantalla
      if (diff > 50 && currentIndex < swipeScreens.length - 1) {
        showScreen(swipeScreens[currentIndex + 1]);
      } else if (diff < -50 && currentIndex > 0) {
        showScreen(swipeScreens[currentIndex - 1]);
      }
    }, { passive: true });
  },
  
  exportCSV() {
    let csv = '"CALIFICACIONES"\n\n';
    
    State.materias.forEach((m, mi) => {
      const headers = ['"Materia"']; 
      const values = [`"${m.nombre || `Materia ${mi + 1}`}"`];
      
      m.rubros.forEach((r) => {
        r.calificaciones.forEach((g, gi) => {
          headers.push(`"${r.nombre} ${gi + 1}"`);
          values.push(g === '' || g === null || g === undefined ? '' : parseFloat(g).toFixed(2));
        });
        const avg = Calc.rubroAvg(r);
        headers.push(`"Promedio ${r.nombre}"`);
        values.push(avg !== null ? avg.toFixed(2) : '');
      });
      
      const finalAvg = Calc.materiaAvg(m);
      headers.push('"Promedio Final"');
      values.push(finalAvg !== null ? finalAvg.toFixed(2) : '');
      
      csv += headers.join(',') + '\n';
      csv += values.join(',') + '\n';
      
      if (mi < State.materias.length - 1) csv += '\n';
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url); link.setAttribute('download', 'calcgrade_datos.csv');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url); toast('Archivo descargado');
  },

 openAnalytics() { 
    showScreen('s-analytics'); // Se abre estático, sin efecto de deslizamiento lateral
    App.renderAnalyticsKPIs();
    App.renderHistoryList(); 
    App.renderChart(); 
  },

  renderAnalyticsKPIs() {
    // Calculamos el promedio del semestre actual
    const avgs = State.materias.map(m => Calc.materiaAvg(m)).filter(v => v !== null);
    const currentAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    
    // Unimos los promedios pasados con el actual
    let allProms = State.historial.map(h => parseFloat(h.promedio));
    if (currentAvg !== null) allProms.push(currentAvg);
    
    // KPIs Clave
    const globalAvg = allProms.length ? allProms.reduce((a,b) => a+b, 0) / allProms.length : null;
    const best = allProms.length ? Math.max(...allProms) : null;
    
    $('analytics-kpis').innerHTML = `
      <div class="metric"><div class="m-label">Promedio Global</div><div class="big-grade" style="font-size:32px;">${globalAvg !== null ? fmt(globalAvg) : '—'}</div></div>
      <div class="metric"><div class="m-label">Mejor Semestre</div><div class="big-grade" style="font-size:32px; color:var(--green);">${best !== null ? fmt(best) : '—'}</div></div>
    `;
  },

  addHistory() {
    const sem = $('hist-sem').value.trim(); const prom = parseFloat($('hist-prom').value);
    if (!sem) { toast('Escribe el semestre'); return; }
    if (isNaN(prom) || prom < 0 || prom > 10) { toast('Promedio inválido'); return; }
    State.historial.push({ semestre: sem, promedio: prom });
    $('hist-sem').value = ''; $('hist-prom').value = '';
    scheduleSave(); App.renderAnalyticsKPIs(); App.renderHistoryList(); App.renderChart(); toast('Historial guardado');
  },
  
  delHistory(idx) {
    if (!confirm('¿Eliminar este registro?')) return;
    State.historial.splice(idx, 1); scheduleSave(); App.renderAnalyticsKPIs(); App.renderHistoryList(); App.renderChart();
  },
  
  renderHistoryList() {
    const container = $('history-list');
    if (!State.historial.length) {
      container.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;">No hay registros de semestres anteriores.</p>';
      return;
    }
    container.innerHTML = State.historial.map((h, i) => `
      <div class="hist-item">
        <span class="hist-sem">${h.semestre}</span>
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="hist-prom">${fmt(h.promedio)}</span>
          <button class="btn-icon" style="width:26px; height:26px; font-size:12px; color:var(--red); background:var(--red-bg);" onclick="App.delHistory(${i})">✕</button>
        </div>
      </div>
    `).join('');
  },
  
  renderChart() {
    const ctx = document.getElementById('analyticsChart'); if (!ctx) return;
    if (analyticsChartInstance) analyticsChartInstance.destroy();
    
    const labels = State.historial.map((h) => h.semestre);
    const data = State.historial.map((h) => h.promedio);
    
    const avgs = State.materias.map((m) => Calc.materiaAvg(m)).filter((v) => v !== null);
    const currentAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    if (currentAvg !== null) { labels.push('Actual'); data.push(currentAvg); }
    
    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#5d7bff';
    
    analyticsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ 
          label: 'Promedio', 
          data, 
          borderColor: accentColor, 
          backgroundColor: 'rgba(93, 123, 255, 0.1)', 
          borderWidth: 2, 
          fill: true, 
          tension: 0.3, 
          pointBackgroundColor: accentColor 
        }],
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }, 
        scales: { 
          y: { min: 0, max: 10, grid: { color: 'rgba(255,255,255,0.05)' } }, 
          x: { grid: { display: false } } 
        } 
      },
    });
  },

  calcGlobalTarget() {
    const target = parseFloat($('global-target').value);
    const rem = parseInt($('global-rem').value);
    const resEl = $('global-target-result');
    
    // Si los campos están vacíos o no tienen sentido, mostramos el mensaje por defecto
    if (isNaN(target) || isNaN(rem) || rem <= 0 || target < 0 || target > 10) {
      resEl.innerHTML = 'Ingresa tu meta de graduación y cuántos semestres te faltan para calcular qué promedio necesitas mantener.';
      resEl.style.color = 'var(--text2)';
      resEl.style.background = 'var(--bg3)';
      return;
    }

    // 1. Obtener el promedio del semestre actual
    const avgs = State.materias.map(m => Calc.materiaAvg(m)).filter(v => v !== null);
    const currentAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    
    // 2. Unir todo tu historial + semestre actual
    let allProms = State.historial.map(h => parseFloat(h.promedio));
    if (currentAvg !== null) allProms.push(currentAvg);

    const nDone = allProms.length;
    if (nDone === 0) {
      resEl.innerHTML = '⚠️ Necesitas tener al menos una materia con calificaciones en el semestre actual o un semestre en el historial.';
      return;
    }

    // 3. Ecuación para despejar el promedio necesario
    const sumDone = allProms.reduce((a, b) => a + b, 0);
    const nTotal = nDone + rem;
    
    const requiredSum = (target * nTotal) - sumDone;
    const requiredAvg = requiredSum / rem;

    // 4. Mostrar resultados con colores dinámicos
    if (requiredAvg > 10) {
      resEl.innerHTML = `⚠️ <strong>Imposible:</strong> Necesitarías un promedio de <strong>${requiredAvg.toFixed(2)}</strong> en tus próximos semestres, lo cual supera el 10 perfecto.`;
      resEl.style.color = 'var(--red)';
      resEl.style.background = 'var(--red-bg)';
    } else if (requiredAvg <= target && requiredSum <= 0) {
      resEl.innerHTML = `✓ <strong>Meta asegurada:</strong> Tu promedio actual ya cubre tu objetivo.`;
      resEl.style.color = 'var(--green)';
      resEl.style.background = 'var(--green-bg)';
    } else {
      resEl.innerHTML = `🎯 Para graduarte con <strong>${target}</strong>, necesitas mantener un promedio exacto de <strong>${requiredAvg.toFixed(2)}</strong> en tus próximos ${rem} semestre${rem > 1 ? 's' : ''}.`;
      resEl.style.color = 'var(--accent2)';
      resEl.style.background = 'rgba(93, 123, 255, 0.1)';
    }
  },
  
  resetAll() {
    if (!confirm('¿Borrar toda la configuración de materias y empezar de nuevo? El historial de analíticas se mantendrá.')) return;
    State.materias = []; State.agenda = [];
    DB.save({ materias: [], minPass: State.minPass, historial: State.historial, agenda: [] }); 
    showScreen('s-setup');
  },
  startConfig() {
    const n = parseInt($('inp-num-mat').value) || 4; const mp = parseFloat($('inp-min-pass').value) || 6.0;
    State.totalMaterias = Math.max(1, Math.min(20, n)); State.minPass = Math.max(1, Math.min(10, mp)); State.materias = [];
    State.configIdx = 0; App.buildConfigForm(); showScreen('s-config');
  },

  renderConfigColors() {
    return PALETTE.map(c => `<div class="color-dot ${State.materias[State.configIdx].color === c ? 'active' : ''}" style="background:${c};" onclick="App.setConfigColor('${c}')"></div>`).join('');
  },
  setConfigColor(c) { State.materias[State.configIdx].color = c; App.buildConfigForm(); },

  buildConfigForm() {
    const idx = State.configIdx; const total = State.totalMaterias;
    if (!State.materias[idx]) {
      State.materias[idx] = {
        nombre: '', color: PALETTE[idx % PALETTE.length], redondeo: false, redondeoUmbral: 0.5, rubros: [
          { nombre: 'Exámenes', porcentaje: 60, calificaciones: [], pendientes: 0 },
          { nombre: 'Tareas', porcentaje: 20, calificaciones: [], pendientes: 0 },
          { nombre: 'Proyecto', porcentaje: 20, calificaciones: [], pendientes: 0 },
        ],
      };
    }
    const mat = State.materias[idx]; let pips = '';
    for (let i = 0; i < total; i++) { pips += `<div class="step-pip ${i < idx ? 'done' : i === idx ? 'active' : ''}"></div>`; }
    $('cfg-stepper').innerHTML = pips; $('cfg-step-label').textContent = `Materia ${idx + 1} de ${total}`;
    const rows = mat.rubros.map((r, i) => `
      <div class="rubro-config-row">
        <input type="text" value="${r.nombre}" placeholder="Nombre del rubro" oninput="App.cfgUpdRubro(${i},'nombre',this.value)">
        <input type="number" min="0" max="100" value="${r.porcentaje}" style="text-align:center" oninput="App.cfgUpdRubro(${i},'porcentaje',this.value)">
        ${mat.rubros.length > 1 ? `<button class="btn-icon" style="color:var(--red);" onclick="App.cfgRemRubro(${i})">✕</button>` : '<div></div>'}
      </div>
    `).join('');
    $('cfg-form').innerHTML = `
      <div class="field"><label>Nombre de la materia</label><input type="text" id="cfg-mat-name" value="${mat.nombre}" placeholder="Ej: Cálculo Diferencial" oninput="State.materias[State.configIdx].nombre=this.value.trim()"></div>
      <div class="field"><label>Color de la materia</label><div class="color-picker">${this.renderConfigColors()}</div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div><p style="font-size:14px;font-weight:500">Rubros de evaluación</p><p style="font-size:12px;color:var(--text3)">Los porcentajes deben sumar exactamente 100%</p></div>
        <button class="btn-ghost btn-sm" onclick="App.cfgAddRubro()">+ Agregar</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 80px 34px;gap:8px;margin-bottom:4px"><span style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Rubro</span><span style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;text-align:center">%</span><span></span></div>
      <div id="cfg-rubros">${rows}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:12px"><span style="font-size:13px;color:var(--text3)">Total</span><div class="pbar-wrap"><div class="pbar-fill" id="cfg-pbar" style="width:0%"></div></div><span id="cfg-ptotal" style="font-family:var(--mono);font-size:14px;min-width:44px;text-align:right"></span></div>
      <div class="err-msg" id="cfg-err"></div>
    `;
    App.cfgUpdateBar();
    let nav = ''; if (idx > 0) nav += '← Anterior';
    nav += idx < total - 1 ? 'Siguiente →' : 'Ver Dashboard ✓';
    $('cfg-nav').innerHTML = nav;
  },
  cfgUpdRubro(i, field, val) {
    const r = State.materias[State.configIdx].rubros[i];
    r[field] = field === 'porcentaje' ? parseFloat(val) || 0 : val;
    App.cfgUpdateBar();
  },
  cfgAddRubro() { State.materias[State.configIdx].rubros.push({ nombre: '', porcentaje: 0, calificaciones: [], pendientes: 0 }); App.buildConfigForm(); },
  cfgRemRubro(i) { State.materias[State.configIdx].rubros.splice(i, 1); App.buildConfigForm(); },
  cfgUpdateBar() {
    const total = State.materias[State.configIdx].rubros.reduce((s, r) => s + (parseFloat(r.porcentaje) || 0), 0);
    const fill = $('cfg-pbar'), lbl = $('cfg-ptotal'); if (!fill) return;
    fill.style.width = Math.min(100, total) + '%';
    fill.style.background = total === 100 ? 'var(--green)' : total > 100 ? 'var(--red)' : 'var(--amber)';
    lbl.textContent = total.toFixed(1) + '%';
    lbl.style.color = total === 100 ? 'var(--green)' : total > 100 ? 'var(--red)' : 'var(--text)';
  },
  cfgValidate() {
    const mat = State.materias[State.configIdx]; const total = mat.rubros.reduce((s, r) => s + (parseFloat(r.porcentaje) || 0), 0);
    const err = $('cfg-err');
    if (!mat.nombre) { err.textContent = 'Escribe el nombre de la materia.'; err.classList.add('show'); return false; }
    if (mat.rubros.some((r) => !r.nombre.trim())) { err.textContent = 'Todos los rubros deben tener nombre.'; err.classList.add('show'); return false; }
    if (Math.abs(total - 100) > 0.01) { err.textContent = `La suma es ${total.toFixed(1)}%. Debe ser exactamente 100%.`; err.classList.add('show'); return false; }
    err.classList.remove('show'); return true;
  },
  cfgNext() { 
    if (!App.cfgValidate()) return; 
    
    // Si aún no llegamos al total de materias, pasamos a la siguiente
    if (State.configIdx < State.totalMaterias - 1) {
      State.configIdx++; 
      App.buildConfigForm(); 
    } else {
      // Si ya llenamos la última, terminamos y vamos al Dashboard
      App.cfgFinish();
    }
  },
  cfgPrev() { State.configIdx--; App.buildConfigForm(); },
  async cfgFinish() {
    if (!App.cfgValidate()) return;
    State.materias.forEach((m) => m.rubros.forEach((r) => { if (!r.calificaciones) r.calificaciones = []; if (r.pendientes === undefined) r.pendientes = 0; }));
    await DB.save({ materias: State.materias, minPass: State.minPass, historial: State.historial, agenda: State.agenda });
    App.buildDashboard(); showScreen('s-dashboard');
  },

  updateDashboardWidget() {
    const pending = State.agenda.filter(e => !e.completado);
    const widget = $('dash-agenda-widget');
    if (!widget) return;
    if (pending.length > 0) {
      widget.style.display = 'block';
      $('dash-agenda-text').textContent = `Tienes ${pending.length} pendiente${pending.length>1?'s':''} en la agenda`;
    } else {
      widget.style.display = 'none';
    }
  },

 buildDashboard() {
    const mats = State.materias; const btn = $('btn-user-menu');
    if (btn) btn.textContent = State.user?.email?.split('@')[0] ?? 'Perfil';
    $('dash-sub').textContent = `${mats.length} materias · Mínimo aprobatorio: ${State.minPass.toFixed(1)}`;
    const avgs = mats.map((m) => Calc.materiaAvg(m)).filter((v) => v !== null);
    const globalAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    const passing = mats.filter((m) => { const a = Calc.materiaAvg(m); return a !== null && a >= State.minPass; }).length;
    $('dash-summary').innerHTML = `
      <div class="metric"><div class="m-label">Promedio general</div><div class="big-grade">${globalAvg !== null ? fmt(globalAvg) : '—'}</div><div class="m-sub">${avgs.length ? 'Promedio de materias con datos' : 'Sin calificaciones aún'}</div></div>
      <div class="metric"><div class="m-label">Aprobadas</div><div class="big-grade" style="color:var(--green);">${avgs.length ? passing : '—'}</div><div class="m-sub">de ${mats.length} materias</div></div>
    `;
    
    App.updateDashboardWidget();

    const rubroColors = ['#5d7bff', '#2ecc8a', '#f5a623', '#ff5f72', '#a78bfa', '#34d399'];

    $('dash-cards').innerHTML = mats.map((m, i) => {
      const avg = Calc.materiaAvg(m);
      const covered = m.rubros.reduce((s, r) => s + (Calc.rubroAvg(r) !== null ? r.porcentaje : 0), 0);
      
      const bars = m.rubros.map((r, j) => {
        const hasData = Calc.rubroAvg(r) !== null;
        return `<div class="drb" style="flex:${r.porcentaje}; background: ${hasData ? rubroColors[j % rubroColors.length] : 'var(--bg3)'}"></div>`;
      }).join('');
      
      const totalPend = m.rubros.reduce((s, r) => s + (r.pendientes ?? 0), 0);
      
      return `<div class="card card-clickable" style="border-left: 4px solid ${m.color || 'var(--accent)'};" onclick="App.openMateria(${i})">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div><div style="font-size:16px;font-weight:500;margin-bottom:3px">${m.nombre || `Materia ${i + 1}`}</div><div style="font-size:12px;color:var(--text3)">${m.rubros.length} rubros · ${covered}% cubierto${totalPend > 0 ? ` · ${totalPend} pendiente${totalPend > 1 ? 's' : ''}` : ''}</div></div>
          <div style="text-align:right"><div class="big-grade ${gradeClass(avg)}" style="font-size:28px">${avg !== null ? fmt(avg) : '—'}</div><div class="badge ${avg !== null && avg >= State.minPass ? 'badge-green' : avg !== null ? 'badge-red' : ''}" style="margin-top:4px;">${badgeForGrade(avg)}</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px"><div class="pbar-wrap"><div class="pbar-fill" style="width:${covered}%;background:var(--accent)"></div></div><span style="font-size:11px;color:var(--accent);font-family:var(--mono);font-weight:500;">${covered}%</span></div>
        <div class="dash-rubros-bar">${bars}</div>
      </div>`;
    }).join('');
    App.syncThemeBtn();
  },

  openMateria(i) { State.activeMateria = i; App.buildMateriaDetail(); showScreen('s-materia'); },
  deleteMateria() {
    const mat = State.materias[State.activeMateria]; const nombre = mat.nombre || `Materia ${State.activeMateria + 1}`;
    if (!confirm(`¿Eliminar "${nombre}"?\nEsta acción no se puede deshacer.`)) return;
    State.materias.splice(State.activeMateria, 1); DB.save({ materias: State.materias, minPass: State.minPass, historial: State.historial, agenda: State.agenda });
    toast(`"${nombre}" eliminada`); App.buildDashboard(); showScreen('s-dashboard');
  },
  goBack(animClass = null) { 
    App.buildDashboard(); 
    showScreen('s-dashboard', typeof animClass === 'string' ? animClass : null); 
  },
  
  updateDots(panel) {
    const dots = $('swipe-dots'); 
    if (!dots) return;
    if (panel === 'dashboard' || panel === 'agenda') {
      dots.style.display = 'flex';
      $('dot-dash').classList.toggle('active', panel === 'dashboard');
      $('dot-agenda').classList.toggle('active', panel === 'agenda');
    } else {
      dots.style.display = 'none';
    }
  },
  updateDots(panel) {
    const dots = $('swipe-dots'); if (!dots) return;
    if (panel === 'dashboard' || panel === 'agenda') {
      dots.style.display = 'flex';
      $('dot-dash').classList.toggle('active', panel === 'dashboard');
      $('dot-agenda').classList.toggle('active', panel === 'agenda');
    } else {
      dots.style.display = 'none';
    }
  },

  toggleRedondeo(val) {
    State.materias[State.activeMateria].redondeo = val;
    scheduleSave(); App.buildMateriaDetail();
  },
  updateUmbral(val) {
    let u = parseFloat(val);
    if (isNaN(u) || u < 0.1 || u > 0.9) u = 0.5;
    State.materias[State.activeMateria].redondeoUmbral = u;
    scheduleSave(); App.buildMateriaDetail();
  },

 buildMateriaDetail() {
    const mat = State.materias[State.activeMateria]; const avg = Calc.materiaAvg(mat); const total = Calc.materiaTotal(mat);
    
    const badgeEl = $('mat-header-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="badge ${avg !== null && avg >= State.minPass ? 'badge-green' : avg !== null ? 'badge-red' : ''}">${badgeForGrade(avg)}</span>`;
    }
    
    const rubroHtml = mat.rubros.map((r, ri) => {
      const ravg = Calc.rubroAvg(r); const pend = r.pendientes ?? 0;
      const chipColor = ravg === null ? 'var(--text3)' : ravg >= State.minPass ? 'var(--green)' : 'var(--red)';
      
      // Aquí está la solución exacta para que el cursor no salte:
      const gradesHtml = r.calificaciones.map((g, gi) => `
        <div class="grade-pill">
          <input type="text" id="grade-input-${ri}-${gi}" inputmode="decimal" class="grade-input" value="${g}" placeholder="0.0" oninput="App.updateGrade(${ri},${gi},this.value)" onblur="App.commitGrade(${ri},${gi},this.value,this)">
          <button class="grade-del-btn" onclick="App.removeGrade(${ri},${gi})">✕</button>
        </div>
      `).join('');
      
      return `
        <div class="rubro-grade-row">
          <div class="rg-header">
            <div><span class="rg-name">${r.nombre}</span> <span class="rg-pct">${r.porcentaje}%</span></div>
            <span class="rubro-avg-chip" style="font-family:var(--mono);font-size:16px;font-weight:500;color:${chipColor}">${ravg !== null ? fmt(ravg) : '—'}</span>
          </div>
          <div class="rg-grades">${gradesHtml} <button class="grade-add-btn" onclick="App.addGrade(${ri})">+</button></div>
          <div class="pendientes-row">
            <span class="pendientes-label">📋 ¿Cuántos ${r.nombre} faltan por calificar?</span>
            <div class="pendientes-counter">
              <button onclick="App.setPendientes(${ri}, ${pend - 1})">−</button><div class="pend-val">${pend}</div><button onclick="App.setPendientes(${ri}, ${pend + 1})">+</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    const detailEl = $('mat-detail');
    if (detailEl) {
      detailEl.innerHTML = `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <h2 style="font-size:22px; margin:0;">${mat.nombre || `Materia ${State.activeMateria + 1}`}</h2>
            <div style="background:var(--bg3); padding:8px 12px; border-radius:var(--r-md); border:1px solid var(--border); display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text2);">
                <input type="checkbox" ${mat.redondeo ? 'checked' : ''} onchange="App.toggleRedondeo(this.checked)" style="width:14px; height:14px; accent-color:var(--accent);">
                Redondeo
              </label>
              <div style="display:${mat.redondeo ? 'flex' : 'none'}; align-items:center; gap:6px; font-size:11px; color:var(--text3);">
                Umbral: <input type="number" step="0.1" min="0.1" max="0.9" value="${mat.redondeoUmbral || 0.5}" onchange="App.updateUmbral(this.value)" style="width:46px; padding:2px 4px; font-size:11px; text-align:center; background:var(--bg2); border:1px solid var(--border); color:var(--text); border-radius:4px;">
              </div>
            </div>
          </div>
          <div class="metrics">
            <div class="metric"><div class="m-label">Promedio actual</div><div id="live-avg" class="big-grade ${gradeClass(avg)}">${avg !== null ? fmt(avg) : '—'}</div><div class="m-sub">Solo rubros con datos</div></div>
            <div class="metric"><div class="m-label">Calificación total</div><div id="live-total" class="big-grade ${gradeClass(total)}">${fmt(total)}</div><div class="m-sub">Ponderado 100%</div></div>
          </div>
          <h3 style="font-size:14px;margin:24px 0 16px;">Calificaciones por rubro</h3>
          <div style="background:var(--bg3);border-radius:var(--r-lg);padding:0 16px;border:1px solid var(--border);">${rubroHtml}</div>
        </div>
        <div id="predict-wrap">${App._buildPredictHtml(mat)}</div>
        <div class="card" style="margin-top:16px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;">🎯</div>
            <div><h3 style="font-size:15px;">Simulador de Promedio Objetivo</h3></div>
          </div>
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
            <input type="number" id="inp-target" placeholder="Ej: 8.5" min="0" max="10" step="0.1" style="width:80px; padding:6px 10px; font-size:14px; text-align:center;" oninput="App.calcTargetGrade(this.value)">
            <div id="target-result" style="font-size:13px;color:var(--text2);line-height:1.4;">Ingresa tu calificación deseada para calcular la optimización matemática en tus ítems pendientes.</div>
          </div>
        </div>
      `;
    }
  },
  setPendientes(ri, val) { State.materias[State.activeMateria].rubros[ri].pendientes = Math.max(0, val); scheduleSave(); App.buildMateriaDetail(); },

  calcTargetGrade(val) {
    let target = parseFloat(val); const resEl = $('target-result');
    if (isNaN(target) || target < 0 || target > 10) { resEl.innerHTML = 'Ingresa una calificación objetivo válida (entre 0 y 10).'; return; }
    
    const mat = State.materias[State.activeMateria]; 
    
    if (mat.redondeo && target > State.minPass) {
      const intTarget = Math.floor(target);
      const umbral = parseFloat(mat.redondeoUmbral) || 0.5;
      if (target === intTarget) {
         target = (intTarget - 1) + umbral;
      }
    }

    let maxPossible = 0, K = 0, sumSw_Cp = 0, sumPw_Cp = 0, hasPend = false;
    mat.rubros.forEach((r) => {
      const pend = r.pendientes ?? 0; const wi = r.porcentaje / 100;
      const grades = r.calificaciones.map((x) => parseFloat(x)).filter((x) => !isNaN(x));
      const cCount = grades.length; const sSum = grades.reduce((a, b) => a + b, 0);
      if (pend === 0) {
        const avg = cCount > 0 ? sSum / cCount : 0; K += avg * wi; maxPossible += avg * wi;
      } else {
        hasPend = true; sumSw_Cp += (sSum * wi) / (cCount + pend); sumPw_Cp += (pend * wi) / (cCount + pend); maxPossible += ((sSum + pend * 10) / (cCount + pend)) * wi;
      }
    });
    
    if (!hasPend) { resEl.innerHTML = 'No tienes ítems pendientes para optimizar.'; return; }
    if (target > maxPossible) { resEl.innerHTML = `Meta inalcanzable. El máximo posible es ${fmt(maxPossible)}.`; return; }
    const neededX = (target - K - sumSw_Cp) / sumPw_Cp;
    
    if (neededX <= 0) { resEl.innerHTML = '✓ ¡Objetivo superado! Tu calificación asegurada cubre esta meta.'; } 
    else { resEl.innerHTML = `Necesitas un desempeño exacto de <strong>${fmt(neededX)}</strong> en todos tus ítems pendientes para lograr tu objetivo.`; }
  },

  _buildPredictHtml(mat) {
    const pass = State.minPass; const total = Calc.materiaTotal(mat); const perRub = Calc.predictPerRubro(mat);
    const hasPend = perRub.some((p) => p.pend > 0);
    if (!hasPend) {
      const allFilled = mat.rubros.every((r) => r.calificaciones.some((g) => g !== '' && !isNaN(parseFloat(g))));
      if (allFilled) {
        return `<div class="predict-box" style="text-align:center;padding:24px;">
          <div style="font-size:32px;margin-bottom:12px;">${total >= pass ? '🎉' : '💀'}</div>
          <h3 style="font-size:16px;color:${total >= pass ? 'var(--green)' : 'var(--red)'};">${total >= pass ? `✓ Materia aprobada con promedio ${fmt(total)}` : `✗ Materia reprobada con promedio ${fmt(total)}`}</h3>
        </div>`;
      }
      return `<div class="predict-box"><div class="predict-title">¿Qué necesitas para aprobar con ${pass.toFixed(1)}?</div><p style="font-size:13px;color:var(--text2);line-height:1.5;">Indica cuántos ítems faltan por calificar en cada rubro (usando el contador 📋) para calcular el promedio exacto que necesitas.</p></div>`;
    }
    let maxPossible = total;
    perRub.forEach(({ rubro: r, pend, existingCount }) => {
      if (pend <= 0) return;
      const wi = r.porcentaje / 100;
      const sumExist = r.calificaciones.reduce((s, g) => { const p = parseFloat(g); return s + (isNaN(p) ? 0 : p); }, 0);
      const newAvg = (sumExist + pend * 10) / (existingCount + pend);
      const curAvg = Calc.rubroAvg(r) ?? 0;
      maxPossible = maxPossible - curAvg * wi + newAvg * wi;
    });
    if (maxPossible < pass) {
      return `<div class="predict-box"><div class="predict-title">Proyección de calificación final</div><div style="display:flex;gap:12px;align-items:center;padding:12px;background:var(--red-bg);border-radius:var(--r-md);color:var(--red);">
        <div style="font-size:24px;">⚠️</div><div><strong style="display:block;font-size:14px;">✗ Ya no es posible aprobar.</strong><span style="font-size:12px;opacity:0.9;">Aunque saques 10 en todos tus ítems pendientes, el máximo alcanzable es ${fmt(maxPossible)}.</span></div>
      </div></div>`;
    }
    const rows = perRub.map(({ rubro: r, pend, neededX }) => {
      if (pend === 0) return '';
      let cls, display;
      if (neededX === null) { cls = 'info'; display = 'Sin pendientes'; }
      else if (neededX > 10) { cls = 'imp'; display = `>${fmt(neededX)} ✗`; }
      else if (neededX <= 0) { cls = 'done'; display = 'Ya cubierto ✓'; }
      else if (neededX > 8) { cls = 'warn'; display = fmt(neededX); }
      else { cls = 'ok'; display = fmt(neededX); }
      return `<div class="predict-row"><div class="predict-rubro"><strong>${r.nombre}</strong> (${r.porcentaje}%)<br><span style="font-size:11px;opacity:0.7;">Promedio necesario en ${pend} ítem${pend > 1 ? 's' : ''} pendiente${pend > 1 ? 's' : ''}</span></div><div class="predict-val ${cls}">${display}</div></div>`;
    }).filter(Boolean).join('');
    return `<div class="predict-box"><div class="predict-title">¿Qué necesitas para aprobar con ${pass.toFixed(1)}?</div><p style="font-size:12px;color:var(--text3);margin-bottom:16px;">Promedio exacto requerido en tus ítems pendientes por rubro.</p>${rows}</div>`;
  },

  addGrade(ri) {
    const rubro = State.materias[State.activeMateria].rubros[ri];
    rubro.calificaciones.push('');
    scheduleSave(); App.buildMateriaDetail();
    
    // Calculamos la coordenada exacta del nuevo cuadrito
    const newGi = rubro.calificaciones.length - 1;
    setTimeout(() => { 
      const input = document.getElementById(`grade-input-${ri}-${newGi}`);
      if (input) input.focus(); 
    }, 50);
  },
  commitGrade(ri, gi, val, inputEl) {
    const p = parseFloat(val); const final = isNaN(p) ? '' : Math.max(0, Math.min(10, p));
    State.materias[State.activeMateria].rubros[ri].calificaciones[gi] = final;
    if (inputEl) inputEl.value = final === '' ? '' : final;
    scheduleSave();
    const mat = State.materias[State.activeMateria]; const avg = Calc.materiaAvg(mat); const total = Calc.materiaTotal(mat);
    $('mat-header-badge').innerHTML = `<span class="badge ${avg !== null && avg >= State.minPass ? 'badge-green' : avg !== null ? 'badge-red' : ''}">${badgeForGrade(avg)}</span>`;
    const rubroRows = document.querySelectorAll('.rubro-grade-row');
    if (rubroRows[ri]) {
      const ravg = Calc.rubroAvg(mat.rubros[ri]);
      const chipColor = ravg === null ? 'var(--text3)' : ravg >= State.minPass ? 'var(--green)' : 'var(--red)';
      const chip = rubroRows[ri].querySelector('.rubro-avg-chip');
      if (chip) { chip.style.color = chipColor; chip.textContent = ravg !== null ? fmt(ravg) : '—'; }
    }
    const avgEl = $('live-avg'); const totalEl = $('live-total');
    if (avgEl) { avgEl.textContent = avg !== null ? fmt(avg) : '—'; avgEl.className = 'big-grade ' + gradeClass(avg); }
    if (totalEl) { totalEl.textContent = fmt(total); totalEl.className = 'big-grade ' + gradeClass(total); }
    const predictWrap = $('predict-wrap'); if (predictWrap) predictWrap.innerHTML = App._buildPredictHtml(mat);
    const targetInp = $('inp-target'); if (targetInp && targetInp.value) App.calcTargetGrade(targetInp.value);
  },
  removeGrade(ri, gi) {
    State.materias[State.activeMateria].rubros[ri].calificaciones.splice(gi, 1);
    scheduleSave(); App.buildMateriaDetail();
  },
  updateGrade(ri, gi, val) {
    const raw = val; const p = parseFloat(val);
    State.materias[State.activeMateria].rubros[ri].calificaciones[gi] = raw === '' || raw === null ? '' : isNaN(p) ? raw : Math.max(0, Math.min(10, p));
    scheduleSave();
    const mat = State.materias[State.activeMateria]; const avg = Calc.materiaAvg(mat); const total = Calc.materiaTotal(mat);
    $('mat-header-badge').innerHTML = `<span class="badge ${avg !== null && avg >= State.minPass ? 'badge-green' : avg !== null ? 'badge-red' : ''}">${badgeForGrade(avg)}</span>`;
    const rubroRows = document.querySelectorAll('.rubro-grade-row');
    if (rubroRows[ri]) {
      const ravg = Calc.rubroAvg(mat.rubros[ri]);
      const chipColor = ravg === null ? 'var(--text3)' : ravg >= State.minPass ? 'var(--green)' : 'var(--red)';
      const chip = rubroRows[ri].querySelector('.rubro-avg-chip');
      if (chip) { chip.style.color = chipColor; chip.textContent = ravg !== null ? fmt(ravg) : '—'; }
    }
    const avgEl = $('live-avg'); const totalEl = $('live-total');
    if (avgEl) { avgEl.textContent = avg !== null ? fmt(avg) : '—'; avgEl.className = 'big-grade ' + gradeClass(avg); }
    if (totalEl) { totalEl.textContent = fmt(total); totalEl.className = 'big-grade ' + gradeClass(total); }
    const predictWrap = $('predict-wrap'); if (predictWrap) predictWrap.innerHTML = App._buildPredictHtml(mat);
    const targetInp = $('inp-target'); if (targetInp && targetInp.value) App.calcTargetGrade(targetInp.value);
  },

  _addModalRubros: [],
  openAddMateria() {
    App._addModalRubros = [ { nombre: 'Exámenes', porcentaje: 60 }, { nombre: 'Tareas', porcentaje: 20 }, { nombre: 'Proyecto', porcentaje: 20 } ];
    $('add-mat-nombre').value = ''; $('add-mat-err').classList.remove('show');
    
    // Configurar color inicial
    App._activeColor = PALETTE[0];
    App._renderAddMatColors();

    App._renderAddModalRubros(); $('add-materia-modal').classList.remove('hidden');
  },
  _renderAddMatColors() {
    const el = $('add-mat-colors');
    if (el) el.innerHTML = PALETTE.map(c => `<div class="color-dot ${App._activeColor === c ? 'active' : ''}" style="background:${c};" onclick="App.setAddMatColor('${c}')"></div>`).join('');
  },
  setAddMatColor(c) { App._activeColor = c; App._renderAddMatColors(); },
  closeAddMateria(e) { if (e && e.target !== $('add-materia-modal')) return; $('add-materia-modal').classList.add('hidden'); },
  _renderAddModalRubros() {
    const rubros = App._addModalRubros;
    $('add-mat-rubros').innerHTML = rubros.map((r, i) => `
      <div class="rubro-config-row">
        <input type="text" value="${r.nombre}" placeholder="Nombre del rubro" oninput="App._addModalRubros[${i}].nombre=this.value">
        <input type="number" min="0" max="100" value="${r.porcentaje}" style="text-align:center" oninput="App._addModalRubros[${i}].porcentaje=parseFloat(this.value)||0; App._updateAddBar()">
        ${rubros.length > 1 ? `<button class="btn-icon" style="color:var(--red);" onclick="App._addModalRubros.splice(${i},1);App._renderAddModalRubros()">✕</button>` : '<div></div>'}
      </div>
    `).join('');
    App._updateAddBar();
  },
  addModalRubro() { App._addModalRubros.push({ nombre: '', porcentaje: 0 }); App._renderAddModalRubros(); },
  _updateAddBar() {
    const total = App._addModalRubros.reduce((s, r) => s + (parseFloat(r.porcentaje) || 0), 0);
    const fill = $('add-pbar'), lbl = $('add-ptotal'); if (!fill) return;
    fill.style.width = Math.min(100, total) + '%';
    fill.style.background = total === 100 ? 'var(--green)' : total > 100 ? 'var(--red)' : 'var(--amber)';
    lbl.textContent = total.toFixed(1) + '%';
    lbl.style.color = total === 100 ? 'var(--green)' : total > 100 ? 'var(--red)' : 'var(--text)';
  },
  async saveNewMateria() {
    const nombre = $('add-mat-nombre').value.trim(); const rubros = App._addModalRubros;
    const total = rubros.reduce((s, r) => s + (parseFloat(r.porcentaje) || 0), 0);
    const err = $('add-mat-err'); err.classList.remove('show');
    if (!nombre) { err.textContent = 'Escribe el nombre de la materia.'; err.classList.add('show'); return; }
    if (rubros.some((r) => !r.nombre.trim())) { err.textContent = 'Todos los rubros deben tener nombre.'; err.classList.add('show'); return; }
    if (Math.abs(total - 100) > 0.01) { err.textContent = `La suma es ${total.toFixed(1)}%. Debe ser 100%.`; err.classList.add('show'); return; }
    State.materias.push({
      nombre, color: App._activeColor, redondeo: false, redondeoUmbral: 0.5, rubros: rubros.map((r) => ({ nombre: r.nombre.trim(), porcentaje: parseFloat(r.porcentaje), calificaciones: [], pendientes: 0 })),
    });
    await DB.save({ materias: State.materias, minPass: State.minPass, historial: State.historial, agenda: State.agenda });
    $('add-materia-modal').classList.add('hidden'); toast(`"${nombre}" agregada`); App.buildDashboard();
  },

  toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme'); const btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = isLight ? '☾' : '☼';
    localStorage.setItem('gradecalc-theme', isLight ? 'light' : 'dark');
    if (analyticsChartInstance) App.renderChart();
  },
  loadTheme() { if (localStorage.getItem('gradecalc-theme') === 'light') { document.body.classList.add('light-theme'); } },
  syncThemeBtn() { const btn = document.getElementById('btn-theme'); if (!btn) return; btn.textContent = document.body.classList.contains('light-theme') ? '☾' : '☼'; },
};

// ── GESTIÓN DEL BOTÓN ATRÁS DEL NAVEGADOR ──
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.screen) {
    // Si hay una pantalla guardada, retrocedemos a ella (con el false evitamos un bucle)
    showScreen(e.state.screen, 'slide-in-left', false);
  } else if (State.user) {
    // Si no hay historial pero estamos logueados, forzamos el dashboard
    App.buildDashboard();
    showScreen('s-dashboard', 'slide-in-left', false);
  }
});

// ── BOOT Y REGISTRO OFFLINE ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { 
  App.loadTheme(); 
  App.initSwipes(); 

  // 1. EL BYPASS OFFLINE: Si no hay red pero sí hay datos en el celular
  if (!navigator.onLine && localStorage.getItem('calcgrade_data')) {
    console.log("Activando Bypass Offline...");
    
    // Creamos un usuario fantasma temporal para que no haya errores
    State.user = { id: 'offline', email: 'Modo Offline' }; 
    
    // Cargamos los datos del teléfono
    const saved = JSON.parse(localStorage.getItem('calcgrade_data'));
    State.materias = saved.materias || []; 
    State.historial = saved.historial || []; 
    State.agenda = saved.agenda || [];
    State.minPass = saved.minPass ?? 6.0;

    // Saltamos el login y dibujamos el Dashboard
    App.buildDashboard(); 
    showScreen('s-dashboard', null, false);

    // Cambiamos el texto del botón superior para que sepas que estás sin red
    const btn = document.getElementById('btn-user-menu');
    if (btn) {
      btn.textContent = 'Sin Conexión';
      btn.style.display = 'inline-flex';
      btn.style.color = '#fff';
      btn.style.background = 'var(--red)';
    }
  } else {
    // 2. Flujo normal (Con internet, Google hace su trabajo)
    Auth.init(); 
  }

  // 3. Registrar el Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
});

// 4. AUTO-RECUPERACIÓN: Si de pronto regresa el internet, recargamos la app 
// para que inicie sesión en silencio y suba tus tareas pendientes a la nube.
window.addEventListener('online', () => {
  if (State.user && State.user.id === 'offline') window.location.reload();
});
