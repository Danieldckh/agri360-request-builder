(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var clientId = params.get('clientId');
  var deliverableId = params.get('deliverableId') || null;
  var clientIdNum = clientId != null && clientId !== '' ? parseInt(clientId, 10) : null;

  // Client-portal base injected at publish time. The browser only ever sees
  // this public URL, never the CRM key (proxied server-side).
  var CLIENT_PORTAL_BASE = (window.__CLIENT_PORTAL_BASE__ || 'https://clientportal.proagrihub.com')
    .replace(/\/+$/, '');

  // Card model:
  //   { id, question, fields: [{ id, fieldType, label }] }
  var cards = [];
  var formName = '';

  var FIELD_TYPES = [
    { type: 'text',     icon: 'T',  label: 'Short Text' },
    { type: 'textarea', icon: '¶', label: 'Long Text' },
    { type: 'number',   icon: '#',  label: 'Number' },
    { type: 'date',     icon: '📅', label: 'Date' },
    { type: 'file',     icon: '↥', label: 'File Upload' }
  ];

  var FIELD_PREVIEWS = {
    text:     '[ Short text input ]',
    textarea: '[ Multi-line text area ]',
    number:   '[ Number input ]',
    date:     '[ Date picker ]',
    file:     '[ File upload ]'
  };

  // ── DOM refs ─────────────────────────────────────────────
  var clientNameEl   = document.getElementById('clientName');
  var formNameInput  = document.getElementById('formName');
  var cardsWrap      = document.getElementById('cardsWrap');
  var successMsg     = document.getElementById('successMsg');
  var paletteList    = document.getElementById('paletteList');
  var templateList   = document.getElementById('templateList');
  var addCardBtn     = document.getElementById('addCardBtn');
  var publishBtn     = document.getElementById('publishBtn');

  formNameInput.addEventListener('input', function () { formName = formNameInput.value; });

  // Generate stable ids so re-renders preserve focus/state
  var _idCounter = 0;
  function nextId() { return 'fb_' + (++_idCounter) + '_' + Date.now().toString(36); }

  function jsonHeaders() { return { 'Content-Type': 'application/json' }; }

  // ── Legacy card shape migration ──────────────────────────
  function normalizeCards(raw) {
    return (raw || []).map(function (c) {
      if (c && Array.isArray(c.fields)) {
        return {
          id: c.id || nextId(),
          question: c.question || '',
          fields: c.fields.map(function (f) {
            return { id: f.id || nextId(), fieldType: f.fieldType || 'text', label: f.label || '' };
          })
        };
      }
      return {
        id: nextId(),
        question: (c && c.question) || '',
        fields: [{ id: nextId(), fieldType: (c && c.fieldType) || 'text', label: '' }]
      };
    });
  }

  // ── Render: palette tiles (draggable) ────────────────────
  function renderPalette() {
    while (paletteList.firstChild) paletteList.removeChild(paletteList.firstChild);
    FIELD_TYPES.forEach(function (t) {
      var tile = document.createElement('div');
      tile.className = 'fb-tile';
      tile.draggable = true;
      tile.dataset.fieldType = t.type;

      var icon = document.createElement('div');
      icon.className = 'fb-tile-icon';
      icon.textContent = t.icon;
      tile.appendChild(icon);

      var lbl = document.createElement('div');
      lbl.className = 'fb-tile-label';
      lbl.textContent = t.label;
      tile.appendChild(lbl);

      tile.addEventListener('dragstart', function (e) {
        tile.classList.add('dragging');
        e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'new-field', fieldType: t.type }));
        e.dataTransfer.effectAllowed = 'copy';
      });
      tile.addEventListener('dragend', function () { tile.classList.remove('dragging'); });

      paletteList.appendChild(tile);
    });
  }

  // ── Render: question cards ───────────────────────────────
  function renderCards() {
    while (cardsWrap.firstChild) cardsWrap.removeChild(cardsWrap.firstChild);

    cards.forEach(function (card, idx) {
      var el = document.createElement('div');
      el.className = 'fb-card';
      el.dataset.cardId = card.id;

      var num = document.createElement('div');
      num.className = 'fb-card-num';
      num.textContent = idx + 1;
      el.appendChild(num);

      var del = document.createElement('button');
      del.className = 'fb-card-delete';
      del.title = 'Delete card';
      del.textContent = '×';
      del.addEventListener('click', function () { cards.splice(idx, 1); renderCards(); });
      el.appendChild(del);

      var q = document.createElement('input');
      q.type = 'text';
      q.className = 'fb-question';
      q.placeholder = 'Question...';
      q.value = card.question || '';
      q.addEventListener('input', function () { card.question = q.value; });
      el.appendChild(q);

      card.fields.forEach(function (field, fIdx) {
        el.appendChild(renderField(card, field, fIdx));
      });

      var dropZone = document.createElement('div');
      dropZone.className = 'fb-drop-zone';
      dropZone.textContent = 'Drop a field here to add to this question';

      dropZone.addEventListener('dragover', function (e) {
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('active');
        el.classList.add('drop-target');
      });
      dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('active');
        el.classList.remove('drop-target');
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('active');
        el.classList.remove('drop-target');
        var payload = parseDragPayload(e);
        if (payload && payload.kind === 'new-field') {
          card.fields.push({ id: nextId(), fieldType: payload.fieldType, label: '' });
          renderCards();
        }
      });
      el.appendChild(dropZone);

      el.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.classList.add('drop-target');
      });
      el.addEventListener('dragleave', function (e) {
        if (!el.contains(e.relatedTarget)) el.classList.remove('drop-target');
      });
      el.addEventListener('drop', function (e) {
        e.preventDefault();
        el.classList.remove('drop-target');
        var payload = parseDragPayload(e);
        if (payload && payload.kind === 'new-field') {
          card.fields.push({ id: nextId(), fieldType: payload.fieldType, label: '' });
          renderCards();
        }
      });

      cardsWrap.appendChild(el);
    });
  }

  function renderField(card, field, fIdx) {
    var row = document.createElement('div');
    row.className = 'fb-field';
    row.dataset.fieldId = field.id;

    var badge = document.createElement('span');
    badge.className = 'fb-field-type-badge';
    badge.textContent = field.fieldType;
    row.appendChild(badge);

    var lbl = document.createElement('input');
    lbl.type = 'text';
    lbl.className = 'fb-field-label';
    lbl.placeholder = FIELD_PREVIEWS[field.fieldType] || 'Label (optional)';
    lbl.value = field.label || '';
    lbl.addEventListener('input', function () { field.label = lbl.value; });
    row.appendChild(lbl);

    var rm = document.createElement('button');
    rm.className = 'fb-field-remove';
    rm.title = 'Remove field';
    rm.textContent = '×';
    rm.addEventListener('click', function () {
      card.fields.splice(fIdx, 1);
      if (card.fields.length === 0) {
        card.fields.push({ id: nextId(), fieldType: 'text', label: '' });
      }
      renderCards();
    });
    row.appendChild(rm);

    return row;
  }

  function parseDragPayload(e) {
    try {
      var raw = e.dataTransfer.getData('text/plain');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) { return null; }
  }

  // ── Canvas-level drop zone (Add Card button) ─────────────
  addCardBtn.addEventListener('click', function () {
    cards.push({ id: nextId(), question: '', fields: [{ id: nextId(), fieldType: 'text', label: '' }] });
    renderCards();
  });
  addCardBtn.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    addCardBtn.classList.add('active');
  });
  addCardBtn.addEventListener('dragleave', function () { addCardBtn.classList.remove('active'); });
  addCardBtn.addEventListener('drop', function (e) {
    e.preventDefault();
    addCardBtn.classList.remove('active');
    var payload = parseDragPayload(e);
    if (payload && payload.kind === 'new-field') {
      cards.push({ id: nextId(), question: '', fields: [{ id: nextId(), fieldType: payload.fieldType, label: '' }] });
      renderCards();
    }
  });

  // ── Templates sidebar (via server proxy) ─────────────────
  function loadTemplates() {
    fetch('/api/request-forms/templates', { headers: jsonHeaders() })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (templates) { renderTemplates(templates); })
      .catch(function () { renderTemplates([]); });
  }

  function renderTemplates(templates) {
    while (templateList.firstChild) templateList.removeChild(templateList.firstChild);
    if (!templates || templates.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'fb-template-empty';
      empty.textContent = 'No templates yet.';
      templateList.appendChild(empty);
      return;
    }
    templates.forEach(function (tmpl) {
      var row = document.createElement('div');
      row.className = 'fb-template-row';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = tmpl.name;
      row.appendChild(name);

      var del = document.createElement('button');
      del.className = 'del';
      del.title = 'Delete template';
      del.textContent = '×';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete template "' + tmpl.name + '"?')) return;
        fetch('/api/request-forms/templates/' + tmpl.id, { method: 'DELETE', headers: jsonHeaders() })
          .then(loadTemplates);
      });
      row.appendChild(del);

      row.addEventListener('click', function () {
        cards = normalizeCards(tmpl.fields);
        formName = tmpl.name;
        formNameInput.value = tmpl.name;
        renderCards();
      });

      templateList.appendChild(row);
    });
  }

  document.getElementById('saveTemplateBtn').addEventListener('click', function () {
    var name = prompt('Template name:', formName || 'My Template');
    if (!name) return;
    fetch('/api/request-forms/templates', {
      method: 'POST', headers: jsonHeaders(),
      body: JSON.stringify({ name: name, fields: cards })
    }).then(function (r) { return r.json(); })
      .then(function () { showSuccess('Template saved: ' + name); loadTemplates(); })
      .catch(function () { showError('Failed to save template'); });
  });

  // ── Publish ──────────────────────────────────────────────
  publishBtn.addEventListener('click', function () {
    if (!formName) { alert('Please enter a form name'); return; }
    if (cards.length === 0) { alert('Please add at least one question card'); return; }

    publishBtn.disabled = true;
    var prevText = publishBtn.textContent;
    publishBtn.textContent = 'Publishing…';

    fetch('/api/request-forms', {
      method: 'POST', headers: jsonHeaders(),
      body: JSON.stringify({
        clientId: clientIdNum,
        deliverableId: deliverableId,
        name: formName,
        fields: cards
      })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        var form = res.body;
        if (!res.ok || (form && form.error)) {
          showError((form && form.error) || 'Publish failed');
          return;
        }
        var token = form && form.token;
        if (!token) {
          showError('Published but no form token returned');
          return;
        }
        showSuccess('Form published! Opening client portal preview…');
        var url = CLIENT_PORTAL_BASE + '/form/' + encodeURIComponent(token);
        // Open the portal preview in a new tab.
        window.open(url, '_blank', 'noopener');
      })
      .catch(function () { showError('Publish failed (network)'); })
      .finally(function () { publishBtn.disabled = false; publishBtn.textContent = prevText; });
  });

  function showSuccess(msg) { showToast(msg, false); }
  function showError(msg) { showToast(msg, true); }
  function showToast(msg, isError) {
    successMsg.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'fb-success' + (isError ? ' error' : '');
    d.textContent = msg;
    successMsg.appendChild(d);
    setTimeout(function () { successMsg.innerHTML = ''; }, 4000);
  }

  // ── Load client info ─────────────────────────────────────
  if (clientIdNum) {
    fetch('/api/clients/' + clientIdNum, { headers: jsonHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (client) {
        if (client && client.name) {
          clientNameEl.innerHTML = 'Client: <b>' + escapeHtml(client.name) + '</b>';
          document.title = 'Request Materials — ' + client.name;
        } else {
          clientNameEl.innerHTML = 'Client: <b>#' + clientIdNum + '</b>';
        }
      })
      .catch(function () { clientNameEl.innerHTML = 'Client: <b>#' + clientIdNum + '</b>'; });
  } else {
    clientNameEl.textContent = 'No client selected';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Initial render ───────────────────────────────────────
  renderPalette();
  // Seed with one empty card so the canvas isn't blank.
  cards.push({ id: nextId(), question: '', fields: [{ id: nextId(), fieldType: 'text', label: '' }] });
  renderCards();
  loadTemplates();

  var savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
})();
