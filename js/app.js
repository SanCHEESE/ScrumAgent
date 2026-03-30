// ============================================
// Kabanchik App Utilities
// ============================================

// --- Session helpers ---

function getCurrentProject() {
  return sessionStorage.getItem('currentProject') || 'p1';
}

function setCurrentProject(id) {
  sessionStorage.setItem('currentProject', id);
}

function isAuthed() {
  return sessionStorage.getItem('authed') === 'true';
}

function setAuthed(val) {
  sessionStorage.setItem('authed', val ? 'true' : 'false');
}

function signOut() {
  sessionStorage.clear();
  window.location.href = 'login.html';
}

// --- Navigation ---

function navigate(href) {
  window.location.href = href;
}

function getUrlParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

// --- Avatar helpers ---

function renderAvatarGroup(participantKeys, max = 4) {
  const all = participantKeys.map(k => getParticipant(k));
  const visible = all.slice(0, max);
  const extra = all.length - max;
  let html = '<div class="avatar-group">';
  visible.forEach(p => {
    html += `<div class="avatar" style="background:${p.color}" title="${p.name}">${p.initials}</div>`;
  });
  if (extra > 0) {
    html += `<div class="avatar avatar-more">+${extra}</div>`;
  }
  html += '</div>';
  return html;
}

function renderAvatar(participantKey, size = 26) {
  const p = getParticipant(participantKey);
  return `<div class="avatar" style="background:${p.color};width:${size}px;height:${size}px;font-size:${Math.floor(size*0.38)}px" title="${p.name}">${p.initials}</div>`;
}

// --- Badge helpers ---

function statusBadge(status) {
  const labels = {
    pending: 'Pending',
    processing: 'Processing',
    transcribing: 'Transcribing',
    analyzing: 'Analyzing',
    done: 'Done',
    error: 'Error',
    active: 'Synced',
    never_synced: 'Never synced',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function confidenceBadge(level) {
  return `<span class="badge badge-${level.toLowerCase()}">${level}</span>`;
}

function updateStatusBadge(status) {
  const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', applied: 'Applied', failed: 'Failed' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

// --- Accordion toggle ---

function toggleAccordion(btn) {
  btn.classList.toggle('open');
  const content = btn.nextElementSibling;
  if (content) content.classList.toggle('open');
}

// --- Tab switching ---

function initTabs(container) {
  const tabs = container.querySelectorAll('.tab-btn');
  const panels = container.querySelectorAll('.tab-panel');
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      panels[i].classList.add('active');
    });
  });
}

// --- Dialog helpers ---

function openDialog(id) {
  document.getElementById(id).classList.add('open');
}

function closeDialog(id) {
  document.getElementById(id).classList.remove('open');
}

// --- Sidebar project switcher ---

function initProjectSwitcher() {
  const btn = document.getElementById('project-switcher-btn');
  const dropdown = document.getElementById('project-dropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.classList.toggle('open');
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    btn.classList.remove('open');
    dropdown.classList.remove('open');
  });

  // Populate dropdown
  const currentId = getCurrentProject();
  dropdown.innerHTML = MOCK_PROJECTS.map(p => `
    <div class="project-dropdown-item ${p.id === currentId ? 'active' : ''}" onclick="switchProject('${p.id}')">
      <div class="dot" style="background:${p.status === 'active' ? '#10b981' : p.status === 'error' ? '#ef4444' : '#9ca3af'}"></div>
      ${p.name}
    </div>
  `).join('');
}

function switchProject(id) {
  setCurrentProject(id);
  window.location.href = 'project-chat.html';
}

// --- Relative time ---

function relativeTime(dateStr) {
  if (!dateStr) return 'Never';
  // For mock purposes, just return as-is if it's already relative
  return dateStr;
}

// --- Simple markdown-ish renderer ---
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*)/gm, '<h3 style="font-size:14px;font-weight:600;margin:12px 0 4px">$1</h3>')
    .replace(/^## (.*)/gm, '<h2 style="font-size:15px;font-weight:700;margin:16px 0 8px">$1</h2>')
    .replace(/^- (.*)/gm, '<li style="margin-left:16px;list-style:disc">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin-bottom:8px">')
    .replace(/\n/g, '<br>');
}
