const forms = document.querySelectorAll('.auth-form');
const navButton = document.querySelector('.btn-nav');
const authPanel = document.querySelector('.auth-panel');
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
const pageSections = document.querySelectorAll('.page-section');
let activeUser = null;
let savedBookmarks = new Set();
let authMode = 'register';
const LOCAL_ACCOUNTS_KEY = 'portal_estudiantil_accounts';
const LOCAL_SESSION_KEY = 'portal_estudiantil_session';
const PASSWORD_HASH_ITERATIONS = 250000;
const LOCAL_ONLY_MODE = true;
const emptyAccountData = () => ({
  note: '',
  featured: { date: '', subjects: [] },
  bookmarks: [],
  surveys: [],
  suggestions: [],
  discussions: {},
});

const api = async (url, options = {}) => {
  throw new Error('Esta función necesita conexión al servidor y no está disponible en el modo local.');
};

const readLocalAccounts = () => {
  const storedAccounts = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
  if (!storedAccounts) return [];
  const accounts = JSON.parse(storedAccounts);
  if (!Array.isArray(accounts)) throw new Error('No se pudieron leer las cuentas guardadas en este navegador.');
  return accounts;
};

const writeLocalAccounts = (accounts) => {
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
};

const getActiveAccountRecord = () => {
  if (!activeUser) return null;
  return readLocalAccounts().find((account) => account.id === activeUser.id) || null;
};

const getActiveAccountData = () => {
  const account = getActiveAccountRecord();
  if (!account) return emptyAccountData();
  return { ...emptyAccountData(), ...account.data };
};

const updateActiveAccountData = (update) => {
  const accounts = readLocalAccounts();
  const accountIndex = accounts.findIndex((account) => account.id === activeUser?.id);
  if (accountIndex < 0) throw new Error('No se encontró la cuenta activa en este navegador.');
  const currentData = { ...emptyAccountData(), ...accounts[accountIndex].data };
  accounts[accountIndex].data = update(currentData);
  writeLocalAccounts(accounts);
  return accounts[accountIndex].data;
};

const toHex = (bytes) => [...new Uint8Array(bytes)]
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

const hashPassword = async (password, saltHex) => {
  if (!window.crypto?.subtle) {
    throw new Error('Este navegador no permite guardar contraseñas localmente. Abre el portal en un navegador compatible.');
  }
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
  const key = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PASSWORD_HASH_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(derivedBits);
};

const createSalt = () => {
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  return toHex(salt);
};

const getLocalAccount = (user) => ({
  id: user.id,
  nombre: user.nombre,
  documento: user.documento,
  grado: user.grado,
  salon: user.salon,
  correo: user.correo,
  role: 'student',
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]);

const showPage = (targetId) => {
  let normalizedId = targetId.startsWith('#') ? targetId.slice(1) : targetId;
  if (![...pageSections].some((section) => section.id === normalizedId)) return;
  if (!activeUser && normalizedId !== 'inicio') {
    normalizedId = 'inicio';
    authMode = 'login';
    forms.forEach((form) => {
      const isVisible = form.id === 'login-form';
      form.hidden = !isVisible;
      form.classList.toggle('active', isVisible);
    });
  }

  pageSections.forEach((section) => {
    const isVisible = section.id === normalizedId;
    section.classList.toggle('is-visible', isVisible);
    section.hidden = !isVisible;
  });

  navLinks.forEach((link) => {
    const isActive = link.getAttribute('href') === `#${normalizedId}`;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  history.replaceState(null, '', `#${normalizedId}`);
};

const initializeTeacherFeedback = () => {
  const button = document.getElementById('load-teacher-feedback');
  const display = document.getElementById('teacher-feedback-results');
  button?.addEventListener('click', async () => {
    try {
      const feedback = await api('/api/feedback');
      display.replaceChildren();
      const entries = [
        ...feedback.suggestions.map((entry) => ({
          heading: `Sugerencia · ${entry.nombre}`,
          text: entry.texto,
        })),
        ...feedback.surveys.map((entry) => ({
          heading: `Encuesta · ${entry.grado} salón ${entry.salon}`,
          text: entry.topics.join(', ') || 'Sin selección',
        })),
      ];
      if (!entries.length) {
        display.textContent = 'Aún no hay respuestas registradas.';
        return;
      }
      entries.forEach((entry) => {
        const card = document.createElement('article');
        const heading = document.createElement('strong');
        const text = document.createElement('p');
        heading.textContent = entry.heading;
        text.textContent = entry.text;
        card.append(heading, text);
        display.append(card);
      });
    } catch (error) {
      display.textContent = error.message;
    }
  });
};

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const targetId = link.getAttribute('href');
  if (!targetId || targetId === '#') return;
  event.preventDefault();
  showPage(targetId);
});

const initialHash = window.location.hash || '#inicio';
showPage(initialHash);

const showMessage = (element, message, type = 'success') => {
  if (!element) return;
  element.textContent = message;
  element.className = `confirmation-message ${type}`;
};

const getSavedStudent = () => {
  return activeUser;
};

const updateSalonOptions = (gradeSelectId, salonSelectId) => {
  const gradeSelect = document.getElementById(gradeSelectId);
  const salonSelect = document.getElementById(salonSelectId);

  if (!gradeSelect || !salonSelect) return;

  const gradeNumber = Number(String(gradeSelect.value).replace(/[^\d]/g, ''));
  const selectedSalon = salonSelect.value;

  salonSelect.innerHTML = `
    <option value="" disabled selected>Selecciona tu salón</option>
    <option value="1">Salón 1</option>
    <option value="2">Salón 2</option>
    <option value="3">Salón 3</option>
    <option value="4">Salón 4</option>
    <option value="5">Salón 5</option>
    <option value="6">Salón 6</option>
    <option value="7">Salón 7</option>
  `;

  if (gradeNumber) {
    salonSelect.value = selectedSalon && ['1', '2', '3', '4', '5', '6', '7'].includes(String(selectedSalon)) ? selectedSalon : '';
  } else {
    salonSelect.value = '';
  }
};

const bindGradeSalonFilter = (gradeSelectId, salonSelectId) => {
  const gradeSelect = document.getElementById(gradeSelectId);
  const salonSelect = document.getElementById(salonSelectId);

  if (!gradeSelect || !salonSelect) return;

  gradeSelect.addEventListener('change', () => {
    updateSalonOptions(gradeSelectId, salonSelectId);
  });

  updateSalonOptions(gradeSelectId, salonSelectId);
};

const initializeWeeklyNote = () => {
  const form = document.getElementById('weekly-note-form');
  const noteInput = document.getElementById('weekly-note');
  const status = document.getElementById('weekly-note-status');

  if (!form || !noteInput) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      updateActiveAccountData((data) => ({ ...data, note: noteInput.value.trim() }));
      if (status) status.textContent = 'Nota guardada en tu cuenta.';
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
};

const getLocalDateKey = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const renderFeaturedSubjects = (container, subjects) => {
  container.replaceChildren();

  if (!subjects.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'Aún no hay materias destacadas para hoy.';
    container.append(emptyMessage);
    return;
  }

  subjects.forEach((subject) => {
    const chip = document.createElement('span');
    chip.className = 'featured-subject-chip';
    chip.textContent = subject;
    container.append(chip);
  });
};

const initializeFeaturedSubjects = () => {
  const form = document.getElementById('featured-subjects-form');
  const display = document.getElementById('featured-subjects-display');
  const status = document.getElementById('featured-subjects-status');

  if (!form || !display) return;

  const today = getLocalDateKey();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const subjects = [...form.querySelectorAll('input[name="featured-subject"]:checked')]
      .map((checkbox) => checkbox.value);

    try {
      updateActiveAccountData((data) => ({ ...data, featured: { date: today, subjects } }));
      renderFeaturedSubjects(display, subjects);
      if (status) status.textContent = 'Materias del día guardadas en tu cuenta.';
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
};

const getGradeSalonCode = (student) => {
  const gradeNumber = Number(String(student?.grado || student?.semestre || '').replace(/[^\d]/g, ''));
  const salon = Number(student?.salon);

  if (!gradeNumber || !salon) return '';
  return String(gradeNumber * 100 + salon);
};

const renderSubjectBoard = async (board) => {
  const subject = board.dataset.subject;
  const grade = board.querySelector('.subject-course')?.value;
  const status = board.querySelector('.subject-status');
  const questionInput = board.querySelector('.subject-question-input');
  const questionDisplay = board.querySelector('.subject-question-display');
  const responsesContainer = board.querySelector('.subject-responses');
  const responseInput = board.querySelector('.subject-response-input');
  const responseButton = board.querySelector('.subject-response-form button[type="submit"]');
  const saveButton = board.querySelector('.save-subject-question');
  const deleteButton = board.querySelector('.btn-delete-question');
  const responseForm = board.querySelector('.subject-response-form');
  if (!activeUser) {
    if (status) status.textContent = 'Inicia sesión para usar esta sección.';
    if (questionDisplay) questionDisplay.textContent = 'Inicia sesión para publicar una pregunta.';
    if (responsesContainer) responsesContainer.replaceChildren();
    if (responseInput) responseInput.disabled = true;
    if (responseButton) responseButton.disabled = true;
    if (questionInput) questionInput.hidden = true;
    if (saveButton) saveButton.hidden = true;
    if (deleteButton) deleteButton.hidden = true;
    if (responseForm) responseForm.hidden = true;
    return;
  }

  const key = `${subject}:${grade}`;
  const activity = grade ? getActiveAccountData().discussions[key] || { question: '', responses: [] } : { question: '', responses: [] };
  if (questionInput) questionInput.value = activity.question || '';
  if (questionDisplay) questionDisplay.textContent = activity.question || 'Aún no hay una pregunta para este curso.';
  if (questionInput) questionInput.hidden = !grade;
  const questionLabel = board.querySelector(`label[for="question-${subject}"]`);
  if (questionLabel) questionLabel.hidden = !grade;
  if (saveButton) saveButton.hidden = !grade;
  if (deleteButton) deleteButton.hidden = !grade || !activity.question;
  if (responseForm) responseForm.hidden = !grade || !activity.question;
  if (responseInput) responseInput.disabled = !activity.question;
  if (responseButton) responseButton.disabled = !activity.question;
  if (status) status.textContent = activity.question
    ? 'Esta pregunta y sus respuestas se guardan solo en tu cuenta.'
    : 'Las preguntas se guardan solo en tu cuenta y no se comparten con otros usuarios.';
  if (!responsesContainer) return;

  responsesContainer.replaceChildren();
  const responses = activity.responses || [];
  if (!responses.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'subject-empty-responses';
    emptyMessage.textContent = 'Todavía no hay respuestas.';
    responsesContainer.append(emptyMessage);
    return;
  }

  responses.forEach((response) => {
    const item = document.createElement('article');
    item.className = 'subject-response-item';
    const author = document.createElement('strong');
    author.textContent = response.nombre;
    const answer = document.createElement('p');
    answer.textContent = response.texto;
    item.append(author, answer);
    responsesContainer.append(item);
  });
};

const initializeSubjectActivities = () => {
  const boards = document.querySelectorAll('.subject-board');
  const student = getSavedStudent();
  const gradeSalonOptions = [];

  for (let grade = 6; grade <= 11; grade += 1) {
    for (let salon = 1; salon <= 7; salon += 1) {
      gradeSalonOptions.push(String(grade * 100 + salon));
    }
  }

  boards.forEach((board) => {
    const subject = board.dataset.subject;
    const courseSelect = board.querySelector('.subject-course');
    const saveButton = board.querySelector('.save-subject-question');
    const deleteButton = board.querySelector('.btn-delete-question');
    const status = board.querySelector('.subject-status');
    const responseForm = board.querySelector('.subject-response-form');

    if (!subject || !courseSelect || !saveButton || !responseForm) return;

    const rebuildCourseOptions = (selectedGradeNumber) => {
      courseSelect.replaceChildren();
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Selecciona el curso';
      courseSelect.append(defaultOption);

      if (!selectedGradeNumber) {
        courseSelect.disabled = true;
        return;
      }

      const allowedCodes = [];
      const currentUser = getSavedStudent();
      const grades = currentUser?.role === 'teacher'
        ? [6, 7, 8, 9, 10, 11]
        : [selectedGradeNumber];
      grades.forEach((gradeNumber) => {
        for (let salon = 1; salon <= 7; salon += 1) {
          allowedCodes.push(String(gradeNumber * 100 + salon));
        }
      });
      if (currentUser?.role !== 'teacher' && !selectedGradeNumber) {
        courseSelect.disabled = true;
        return;
      }

      allowedCodes.forEach((courseCode) => {
        const option = document.createElement('option');
        option.value = courseCode;
        option.textContent = courseCode;
        courseSelect.append(option);
      });

      courseSelect.disabled = false;
      const studentCourseCode = currentUser?.role === 'student' ? getGradeSalonCode(currentUser) : '';
      if (studentCourseCode && allowedCodes.includes(studentCourseCode)) {
        courseSelect.value = studentCourseCode;
      }
    };

    const gradeSelect = document.getElementById('grado');
    const salonSelect = document.getElementById('salon');

    const updateCoursesForStudentGrade = () => {
      const selectedGradeNumber = Number(String(gradeSelect?.value || '').replace(/[^\d]/g, ''));
      const selectedSalonNumber = Number(String(salonSelect?.value || '').replace(/[^\d]/g, ''));

      if (!selectedGradeNumber || !selectedSalonNumber) {
        rebuildCourseOptions(selectedGradeNumber || 0);
        return;
      }

      rebuildCourseOptions(selectedGradeNumber);
      if (getSavedStudent()?.role === 'student') {
        courseSelect.value = String(selectedGradeNumber * 100 + selectedSalonNumber);
      } else {
        rebuildCourseOptions(selectedGradeNumber);
      }
    };

    const selectedGrade = Number(String((student?.grado || student?.semestre || '')).replace(/[^\d]/g, ''));
    rebuildCourseOptions(selectedGrade || 0);

    const studentCourseCode = getGradeSalonCode(student);
    if (studentCourseCode && gradeSalonOptions.includes(studentCourseCode)) {
      courseSelect.value = studentCourseCode;
    }
    if (board.dataset.initialized === 'true') {
      renderSubjectBoard(board);
      return;
    }
    board.dataset.initialized = 'true';
    if (gradeSelect && salonSelect) {
      gradeSelect.addEventListener('change', updateCoursesForStudentGrade);
      salonSelect.addEventListener('change', updateCoursesForStudentGrade);
    }

    courseSelect.addEventListener('change', () => {
      if (status) status.textContent = '';
      renderSubjectBoard(board);
    });

    saveButton.addEventListener('click', async () => {
      const grade = courseSelect.value;
      const question = board.querySelector('.subject-question-input')?.value.trim() || '';

      if (!grade || !question) {
        if (status) status.textContent = 'Selecciona el curso y escribe una pregunta o tema.';
        return;
      }

      try {
        const key = `${subject}:${grade}`;
        updateActiveAccountData((data) => ({
          ...data,
          discussions: {
            ...data.discussions,
            [key]: {
              question,
              author: activeUser.nombre,
              responses: data.discussions[key]?.responses || [],
            },
          },
        }));
        if (status) status.textContent = 'Pregunta guardada solo en tu cuenta.';
        renderSubjectBoard(board);
      } catch (error) {
        if (status) status.textContent = error.message;
      }
    });

    deleteButton.addEventListener('click', () => {
      const grade = courseSelect.value;
      if (!grade) return;
      try {
        const key = `${subject}:${grade}`;
        updateActiveAccountData((data) => {
          const discussions = { ...data.discussions };
          delete discussions[key];
          return { ...data, discussions };
        });
        if (status) status.textContent = 'Se borró la pregunta y sus respuestas de tu cuenta.';
        renderSubjectBoard(board);
      } catch (error) {
        if (status) status.textContent = error.message;
      }
    });

    responseForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const grade = courseSelect.value;
      const answer = board.querySelector('.subject-response-input')?.value.trim() || '';
      if (!grade || !answer) {
        if (status) status.textContent = 'Selecciona el curso y escribe tu respuesta.';
        return;
      }
      try {
        const key = `${subject}:${grade}`;
        updateActiveAccountData((data) => ({
          ...data,
          discussions: {
            ...data.discussions,
            [key]: {
              ...data.discussions[key],
              responses: [
                ...(data.discussions[key]?.responses || []),
                { nombre: activeUser.nombre, texto: answer, createdAt: new Date().toISOString() },
              ],
            },
          },
        }));
        board.querySelector('.subject-response-input').value = '';
        if (status) status.textContent = 'Tu respuesta quedó guardada solo en tu cuenta.';
        renderSubjectBoard(board);
      } catch (error) {
        if (status) status.textContent = error.message;
      }
    });

    renderSubjectBoard(board);
  });
};

const setLoggedInState = (loggedIn) => {
  if (authPanel) authPanel.hidden = loggedIn;
  const topbar = document.querySelector('.dashboard-topbar');
  if (topbar) topbar.hidden = !loggedIn;
  navLinks.forEach((link) => {
    link.hidden = !loggedIn && link.getAttribute('href') !== '#inicio';
  });
  forms.forEach((form) => {
    const isVisible = !loggedIn && (
      (authMode === 'login' && form.id === 'login-form') ||
      (authMode === 'register' && form.id === 'registro-form')
    );
    form.hidden = !isVisible;
    form.classList.toggle('active', isVisible);
  });
  if (navButton) navButton.textContent = loggedIn ? 'Cerrar sesión' : 'Ingresar';
  document.querySelectorAll('.role-tab[data-role="teacher"]').forEach((button) => {
    button.hidden = activeUser?.role !== 'teacher';
  });
  document.querySelectorAll('.role-tab').forEach((button) => {
    const isStudentView = button.dataset.role === 'student';
    button.classList.toggle('active', isStudentView);
  });
  document.querySelectorAll('.role-view').forEach((view) => {
    view.classList.toggle('active', view.classList.contains('student-view'));
  });
};

const SUBJECTS_FOR_SCHOOL = [
  { code: 'matematicas', name: 'Matemáticas', teacher: 'Prof. Carlos Torres', icon: '➗', accent: 'green', focus: 'Resolución' },
  { code: 'sociales', name: 'Sociales', teacher: 'Prof. Daniela García', icon: '🌎', accent: 'orange', focus: 'Debates' },
  { code: 'ingles', name: 'Inglés', teacher: 'Prof. Ana López', icon: '🌐', accent: 'blue', focus: 'Speaking' },
  { code: 'biologia', name: 'Biología', teacher: 'Prof. Samuel Ramírez', icon: '🧬', accent: 'green', focus: 'Laboratorio' },
  { code: 'estadistica', name: 'Estadística', teacher: 'Prof. María Esteban', icon: '📊', accent: 'orange', focus: 'Análisis' },
  { code: 'fisica', name: 'Física', teacher: 'Prof. Javier Cruz', icon: '⚛️', accent: 'blue', focus: 'Experimento' },
  { code: 'informatica', name: 'Informática', teacher: 'Prof. Laura Moreno', icon: '💻', accent: 'green', focus: 'Proyecto' },
];

const renderPerformanceByCourse = async () => {
  const student = getSavedStudent();
  const recognitionGrid = document.getElementById('recognition-grid');
  const rankingGrid = document.getElementById('ranking-grid');
  if (!recognitionGrid || !rankingGrid) return;

  const controls = document.getElementById('recognition-controls');
  const status = document.getElementById('recognition-status');
  if (!student) {
    recognitionGrid.textContent = 'Inicia sesión para consultar los reconocimientos y el ranking de tu curso.';
    rankingGrid.textContent = 'Inicia sesión para consultar el ranking.';
    if (controls) controls.hidden = true;
    return;
  }

  if (LOCAL_ONLY_MODE) {
    if (controls) controls.hidden = true;
    recognitionGrid.textContent = 'Los reconocimientos requieren conexión al servidor.';
    rankingGrid.textContent = 'El rendimiento requiere conexión al servidor.';
    if (status) status.textContent = 'El acceso a tu cuenta funciona localmente en este navegador.';
    return;
  }

  const teacher = student.role === 'teacher';
  if (controls) {
    controls.hidden = !teacher;
    if (teacher && !controls.dataset.ready) {
      controls.dataset.ready = 'true';
      controls.innerHTML = `
        <label>Grado
          <select id="recognition-grade">${[6, 7, 8, 9, 10, 11].map((grade) => `<option value="${grade}°">${grade}°</option>`).join('')}</select>
        </label>
        <label>Salón
          <select id="recognition-salon">${[1, 2, 3, 4, 5, 6, 7].map((salon) => `<option value="${salon}">Salón ${salon}</option>`).join('')}</select>
        </label>
        <label>Estudiante
          <select id="recognition-student"><option value="">Selecciona un estudiante</option></select>
        </label>`;
      controls.querySelector('#recognition-grade').value = student.grado;
      controls.querySelector('#recognition-salon').value = student.salon;
      const loadStudents = async () => {
        try {
          const grade = controls.querySelector('#recognition-grade').value;
          const salon = controls.querySelector('#recognition-salon').value;
          const result = await api(`/api/students?grade=${encodeURIComponent(grade)}&salon=${encodeURIComponent(salon)}`);
          const select = controls.querySelector('#recognition-student');
          select.replaceChildren(new Option('Selecciona un estudiante', ''));
          result.students.forEach((entry) => select.add(new Option(entry.nombre, entry.id)));
          if (select.options.length === 1 && status) status.textContent = 'Aún no hay estudiantes registrados en este curso.';
          await renderPerformanceByCourse();
        } catch (error) {
          showMessage(status, error.message, 'error');
        }
      };
      controls.querySelectorAll('#recognition-grade, #recognition-salon').forEach((select) => {
        select.addEventListener('change', loadStudents);
      });
      controls.querySelector('#recognition-student').addEventListener('change', () => renderPerformanceByCourse());
      loadStudents();
      return;
    }
  }

  const grade = teacher ? controls.querySelector('#recognition-grade').value : student.grado;
  const salon = teacher ? controls.querySelector('#recognition-salon').value : student.salon;
  const targetId = teacher ? controls.querySelector('#recognition-student').value : student.id;
  const course = `${Number(grade.replace(/[^\d]/g, '')) * 100 + Number(salon)}`;
  let result;
  try {
    const query = new URLSearchParams({ grade, salon });
    if (targetId) query.set('studentId', targetId);
    result = await api(`/api/recognition?${query}`);
  } catch (error) {
    showMessage(status, error.message, 'error');
    recognitionGrid.replaceChildren();
    return;
  }

  const scores = new Map(result.scores.map((entry) => [entry.subject, entry]));
  const canEdit = teacher && targetId;
  recognitionGrid.innerHTML = SUBJECTS_FOR_SCHOOL.map((subject) => {
    const values = scores.get(subject.code) || {};
    const fields = [
      { label: 'Participación', key: 'participacion' },
      { label: subject.focus, key: 'enfoque' },
      { label: 'Práctica', key: 'practica' },
    ];
    return `
      <article class="recognition-subject-card">
        <div class="subject-header">
          <span class="teacher-tag">${subject.name}</span>
          <span class="salon-badge">Salón ${course}</span>
        </div>
        <h3>${subject.teacher}</h3>
        ${canEdit && student.materia === subject.code ? `
          <form class="recognition-form" data-subject="${subject.code}">
            ${fields.map((field) => `
              <label>${field.label}
                <input type="number" min="0" max="50" step="1" value="${values[field.key] || 0}" data-field="${field.key}" required />
              </label>`).join('')}
            <p class="points-row total">Total <strong data-total>0 / 50</strong></p>
            <button class="btn-primary full" type="submit">Guardar puntajes</button>
          </form>` : `
          <ul>${fields.map((field) => `<li>${field.label}: <strong>${values[field.key] || 0}</strong></li>`).join('')}</ul>
          ${teacher ? '<p>Esta cuenta no está asignada a tu materia.</p>' : ''}`}
      </article>`;
  }).join('');

  recognitionGrid.querySelectorAll('.recognition-form').forEach((form) => {
    const inputs = [...form.querySelectorAll('input')];
    const totalDisplay = form.querySelector('[data-total]');
    const updateTotal = () => {
      totalDisplay.textContent = `${inputs.reduce((sum, input) => sum + (Number(input.value) || 0), 0)} / 50`;
    };
    inputs.forEach((input) => input.addEventListener('input', updateTotal));
    updateTotal();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(inputs.map((input) => [input.dataset.field, Number(input.value)]));
      if (values.participacion + values.enfoque + values.practica > 50) {
        showMessage(status, 'La suma de puntajes no puede superar 50.', 'error');
        return;
      }
      try {
        await api('/api/recognition', {
          method: 'PUT',
          body: JSON.stringify({ studentId: targetId, subject: form.dataset.subject, ...values }),
        });
        showMessage(status, 'Puntajes guardados correctamente.', 'success');
        await renderPerformanceByCourse();
      } catch (error) {
        showMessage(status, error.message, 'error');
      }
    });
  });

  rankingGrid.innerHTML = result.ranking.length
    ? `<article class="ranking-subject-card">
        <div class="subject-header"><span class="teacher-tag">Curso ${grade} · Salón ${salon}</span></div>
        <table class="mini-ranking-table">
          <thead><tr><th>Pos.</th><th>Estudiante</th><th>Puntos</th></tr></thead>
          <tbody>${result.ranking.map((entry, index) => `
            <tr><td>${index + 1}</td><td>${escapeHtml(entry.nombre)}</td><td>${entry.puntos}</td></tr>`).join('')}
          </tbody>
        </table>
      </article>`
    : 'Aún no hay estudiantes ni puntajes para mostrar en este curso.';
};

const updateProfile = (student) => {
  const nameElement = document.getElementById('profile-name');
  const welcomeNameElement = document.getElementById('welcome-name');
  const gradeElement = document.getElementById('profile-grade');
  const salonElement = document.getElementById('profile-salon');
  const rankingNameElement = document.getElementById('ranking-name');
  const rankingGradeElement = document.getElementById('ranking-grade');
  const documentElement = document.getElementById('profile-document');
  const emailElement = document.getElementById('profile-email');
  const avatarElement = document.getElementById('profile-avatar');
  const topbarAvatarElement = document.getElementById('topbar-avatar');

  if (!student) return;

  if (nameElement && student.nombre) {
    nameElement.textContent = student.nombre;
    const initials = student.nombre
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');

    if (avatarElement) {
      avatarElement.textContent = initials || 'US';
    }

    if (welcomeNameElement) {
      welcomeNameElement.textContent = student.nombre.split(' ')[0];
    }

    if (topbarAvatarElement) {
      topbarAvatarElement.textContent = initials || 'US';
    }
  }

  if (rankingNameElement && student.nombre) {
    rankingNameElement.textContent = student.nombre;
  }

  const grade = student.grado || student.semestre;
  const salon = student.salon ? `Salón ${student.salon}` : '';
  const gradeText = salon ? `${grade} - ${salon}` : grade;

  if (gradeElement && grade) {
    gradeElement.textContent = gradeText;
  }

  if (salonElement) {
    salonElement.textContent = salon || '—';
  }

  if (rankingGradeElement && grade) {
    rankingGradeElement.textContent = gradeText;
  }

  if (documentElement && student.documento) {
    documentElement.textContent = student.documento;
  }

  if (emailElement && student.correo) {
    emailElement.textContent = student.correo;
  }

  renderPerformanceByCourse();
};

const setupPlatformNavigation = () => {
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const activeId = window.location.hash || '#inicio';
  links.forEach((link) => {
    if (link.getAttribute('href') === activeId) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
};

const restoreProfile = (student) => {
  activeUser = student;
  updateProfile(student);
  const surveyGradeSelect = document.getElementById('survey-grade');
  const surveySalonSelect = document.getElementById('survey-salon');
  if (surveyGradeSelect && student.grado) surveyGradeSelect.value = student.grado;
  if (surveySalonSelect && student.salon) surveySalonSelect.value = String(student.salon);
  setLoggedInState(true);
  initializeSubjectActivities();
  renderPerformanceByCourse();
};

document.getElementById('show-registration')?.addEventListener('click', () => {
  authMode = 'register';
  setLoggedInState(false);
});

if (navButton) {
  navButton.addEventListener('click', async () => {
    if (activeUser) {
      try {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        activeUser = null;
        savedBookmarks.clear();
        authMode = 'register';
        setLoggedInState(false);
        document.getElementById('teacher-feedback').hidden = true;
        document.getElementById('profile-name').textContent = 'Completa tu registro';
        document.getElementById('welcome-name').textContent = 'estudiante';
        document.getElementById('profile-grade').textContent = '—';
        document.getElementById('profile-salon').textContent = '—';
        document.getElementById('profile-document').textContent = '—';
        document.getElementById('profile-email').textContent = '—';
        showMessage(document.getElementById('account-status'), '');
        registroForm.reset();
        document.getElementById('weekly-note').value = '';
        document.getElementById('survey-grade').value = '';
        document.getElementById('survey-salon').value = '';
        document.getElementById('teacher-feedback-results').replaceChildren();
        document.querySelectorAll('input[name="featured-subject"]').forEach((checkbox) => {
          checkbox.checked = false;
        });
        renderFeaturedSubjects(document.getElementById('featured-subjects-display'), []);
        document.querySelectorAll('.save-activity').forEach((button) => {
          button.textContent = 'Guardar actividad';
        });
        initializeSubjectActivities();
        await renderPerformanceByCourse();
        showPage('#inicio');
        authPanel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (error) {
        showMessage(document.querySelector('#registro-form .confirmation-message'), error.message, 'error');
      }
      return;
    }

    authMode = 'login';
    setLoggedInState(false);
    showPage('#inicio');
    authPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

const registroForm = document.getElementById('registro-form');
if (registroForm) {
  registroForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nombre = document.getElementById('nombre')?.value.trim() || '';
    const documento = document.getElementById('documento')?.value.trim() || '';
    const grado = document.getElementById('grado')?.value.trim() || '';
    const salon = document.getElementById('salon')?.value.trim() || '';
    const correo = document.getElementById('correo')?.value.trim() || '';
    const password = document.getElementById('password')?.value || '';
    const messageBox = registroForm.querySelector('.confirmation-message');

    if (!nombre || !documento || !grado || !salon || !correo || !password) {
      showMessage(messageBox, 'Completa todos los campos para continuar.', 'error');
      return;
    }
    if (password.length < 8) {
      showMessage(messageBox, 'La contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }
    try {
      const normalizedEmail = correo.toLowerCase();
      const accounts = readLocalAccounts();
      if (accounts.some((account) => account.correo === normalizedEmail)) {
        throw new Error('Ya existe una cuenta con ese correo en este navegador.');
      }
      if (accounts.some((account) => account.documento === documento)) {
        throw new Error('Ya existe una cuenta con ese documento en este navegador.');
      }
      const salt = createSalt();
      const account = {
        id: toHex(window.crypto.getRandomValues(new Uint8Array(16))),
        nombre,
        documento,
        grado,
        salon,
        correo: normalizedEmail,
        role: 'student',
        data: emptyAccountData(),
        passwordSalt: salt,
        passwordHash: await hashPassword(password, salt),
      };
      accounts.push(account);
      writeLocalAccounts(accounts);
      localStorage.setItem(LOCAL_SESSION_KEY, account.id);
      document.getElementById('password').value = '';
      await afterLogin(getLocalAccount(account));
      showMessage(
        document.getElementById('account-status'),
        'Cuenta guardada en este navegador. Ya puedes ingresar sin servidor.',
        'success',
      );
      showPage('#datos-basicos');
    } catch (error) {
      showMessage(messageBox, error.message, 'error');
    }
  });
}

const gradeSurvey = document.getElementById('grade-survey');
if (gradeSurvey) {
  gradeSurvey.addEventListener('submit', async (event) => {
    event.preventDefault();
    const grado = document.getElementById('survey-grade')?.value || '';
    const salon = document.getElementById('survey-salon')?.value || '';
    const priority = document.getElementById('survey-priority')?.value || '';
    const messageBox = gradeSurvey.querySelector('.confirmation-message');
    if (!grado || !salon || !priority) {
      showMessage(messageBox, 'Selecciona tu grado, salón y una prioridad para enviar la respuesta.', 'error');
      return;
    }
    try {
      updateActiveAccountData((data) => ({
        ...data,
        surveys: [
          ...data.surveys.filter((survey) => survey.type !== 'course-priority'),
          { type: 'course-priority', grado, salon, topics: [priority], createdAt: new Date().toISOString() },
        ],
      }));
      showMessage(messageBox, 'Tu respuesta quedó guardada en esta cuenta.', 'success');
    } catch (error) {
      showMessage(messageBox, error.message, 'error');
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const correo = document.getElementById('login-email')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('login-password')?.value || '';
    const messageBox = loginForm.querySelector('.confirmation-message');

    if (!correo || !password) {
      showMessage(messageBox, 'Escribe tu correo y contraseña.', 'error');
      return;
    }

    try {
      const account = readLocalAccounts().find((savedAccount) => savedAccount.correo === correo);
      if (!account) throw new Error('No encontramos una cuenta con ese correo en este navegador.');
      const passwordHash = await hashPassword(password, account.passwordSalt);
      if (passwordHash !== account.passwordHash) throw new Error('La contraseña es incorrecta.');
      if (!account.data) {
        account.data = emptyAccountData();
        const accounts = readLocalAccounts();
        const accountIndex = accounts.findIndex((savedAccount) => savedAccount.id === account.id);
        accounts[accountIndex] = account;
        writeLocalAccounts(accounts);
      }
      localStorage.setItem(LOCAL_SESSION_KEY, account.id);
      document.getElementById('login-password').value = '';
      await afterLogin(getLocalAccount(account));
      showMessage(document.getElementById('account-status'), 'Sesión iniciada en este navegador.', 'success');
      showPage('#datos-basicos');
    } catch (error) {
      showMessage(messageBox, error.message, 'error');
    }
  });
}

const afterLogin = async (user) => {
  document.querySelectorAll('.confirmation-message').forEach((message) => {
    if (message.id !== 'account-status') {
      message.textContent = '';
      message.className = 'confirmation-message';
    }
  });
  [
    'weekly-note-status',
    'featured-subjects-status',
    'quick-survey-status',
    'recognition-status',
  ].forEach((id) => {
    const status = document.getElementById(id);
    if (status) status.textContent = '';
  });
  restoreProfile(user);
  const accountData = getActiveAccountData();
  document.getElementById('teacher-feedback').hidden = true;
  const noteInput = document.getElementById('weekly-note');
  if (noteInput) noteInput.value = accountData.note || '';
  const suggestionInput = document.getElementById('sugerencia');
  if (suggestionInput) suggestionInput.value = '';
  const featured = accountData.featured?.date === getLocalDateKey()
    ? accountData.featured.subjects || []
    : [];
  document.querySelectorAll('input[name="featured-subject"]').forEach((checkbox) => {
    checkbox.checked = featured.includes(checkbox.value);
  });
  const featuredDisplay = document.getElementById('featured-subjects-display');
  if (featuredDisplay) renderFeaturedSubjects(featuredDisplay, featured);
  savedBookmarks = new Set(accountData.bookmarks || []);
  document.querySelectorAll('.save-activity').forEach((button) => {
    button.disabled = false;
    button.textContent = savedBookmarks.has(button.dataset.eventId)
      ? 'Quitar de guardadas'
      : 'Guardar actividad';
  });
  document.querySelectorAll('input[name="survey-topic"]').forEach((input) => {
    input.checked = (accountData.surveys || []).some((survey) => survey.topics.includes(input.value));
  });
};

const roleTabs = document.querySelectorAll('.role-tab');
const roleViews = document.querySelectorAll('.role-view');

if (roleTabs.length) {
  roleTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const selectedRole = tab.dataset.role;
      if (selectedRole === 'teacher' && activeUser?.role !== 'teacher') {
        window.alert('Inicia sesión con una cuenta docente para abrir esta vista.');
        return;
      }
      roleTabs.forEach((btn) => btn.classList.toggle('active', btn === tab));
      roleViews.forEach((view) => {
        const isVisible = view.classList.contains(`${selectedRole}-view`);
        view.classList.toggle('active', isVisible);
      });
      if (selectedRole === 'teacher') {
        document.querySelectorAll('.subject-board').forEach((board) => renderSubjectBoard(board));
      }
    });
  });
}

document.querySelector('[data-open-student-tools]')?.addEventListener('click', () => {
  document.querySelector('.role-tab[data-role="student"]')?.click();
});

const suggestionForm = document.getElementById('suggestion-form');
if (suggestionForm) {
  suggestionForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const sugerencia = document.getElementById('sugerencia')?.value.trim() || '';
    const messageBox = suggestionForm.querySelector('.confirmation-message');

    if (!sugerencia) {
      showMessage(messageBox, 'Escribe una sugerencia antes de enviar.', 'error');
      return;
    }

    try {
      updateActiveAccountData((data) => ({
        ...data,
        suggestions: [...data.suggestions, { texto: sugerencia, createdAt: new Date().toISOString() }],
      }));
      showMessage(messageBox, 'Tu sugerencia quedó guardada en esta cuenta.', 'success');
      document.getElementById('sugerencia').value = '';
    } catch (error) {
      showMessage(messageBox, error.message, 'error');
    }
  });
}

const initializeQuickSurvey = () => {
  const button = document.getElementById('quick-survey-submit');
  const status = document.getElementById('quick-survey-status');
  button?.addEventListener('click', async () => {
    const topics = [...document.querySelectorAll('input[name="survey-topic"]:checked')]
      .map((input) => input.value);
    try {
      updateActiveAccountData((data) => ({
        ...data,
        surveys: [
          ...data.surveys.filter((survey) => survey.type !== 'topic-poll'),
          { type: 'topic-poll', topics, createdAt: new Date().toISOString() },
        ],
      }));
      showMessage(status, 'Tu respuesta quedó guardada en esta cuenta.', 'success');
    } catch (error) {
      showMessage(status, error.message, 'error');
    }
  });
};

const initializeActivityBookmarks = () => {
  document.querySelectorAll('.save-activity').forEach((button) => {
    button.addEventListener('click', async () => {
      const wasSaved = savedBookmarks.has(button.dataset.eventId);
      try {
        if (wasSaved) savedBookmarks.delete(button.dataset.eventId);
        else savedBookmarks.add(button.dataset.eventId);
        updateActiveAccountData((data) => ({ ...data, bookmarks: [...savedBookmarks] }));
        button.textContent = savedBookmarks.has(button.dataset.eventId) ? 'Quitar de guardadas' : 'Guardar actividad';
      } catch (error) {
        showMessage(document.getElementById('account-status'), error.message, 'error');
      }
    });
  });
};

const initializeApp = async () => {
  bindGradeSalonFilter('grado', 'salon');
  bindGradeSalonFilter('survey-grade', 'survey-salon');
  setLoggedInState(false);
  initializeSubjectActivities();
  initializeWeeklyNote();
  initializeFeaturedSubjects();
  initializeQuickSurvey();
  initializeTeacherFeedback();
  initializeActivityBookmarks();
  setupPlatformNavigation();
  try {
    const sessionId = localStorage.getItem(LOCAL_SESSION_KEY);
    const account = sessionId
      ? readLocalAccounts().find((savedAccount) => savedAccount.id === sessionId)
      : null;
    if (account) {
      await afterLogin(getLocalAccount(account));
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      await renderPerformanceByCourse();
    }
  } catch (error) {
    showMessage(document.querySelector('#registro-form .confirmation-message'), error.message, 'error');
    await renderPerformanceByCourse();
  }
};

initializeApp();
