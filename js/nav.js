// ============================================
// Kabanchik Sidebar Nav Component
// ============================================

function renderNav(activePage) {
  const currentId = getCurrentProject();
  const project = getProjectById(currentId) || MOCK_PROJECTS[0];

  const links = [
    { id: 'chat',     label: 'Chat',        icon: '💬', href: 'project-chat.html' },
    { id: 'meetings', label: 'Meetings',     icon: '📹', href: 'project-meetings.html' },
    { id: 'updates',  label: 'Updates',      icon: '✓',  href: 'project-updates.html', badge: 2 },
    { id: 'trace',    label: 'Agent Trace',  icon: '📋', href: 'project-trace.html' },
    { id: 'settings', label: 'Settings',     icon: '⚙️', href: 'project-settings.html' },
  ];

  const navLinksHtml = links.map(link => `
    <a href="${link.href}" class="nav-link ${activePage === link.id ? 'active' : ''}">
      <span class="nav-icon">${link.icon}</span>
      ${link.label}
      ${link.badge ? `<span class="nav-badge">${link.badge}</span>` : ''}
    </a>
  `).join('');

  const projectsHtml = MOCK_PROJECTS.map(p => `
    <div class="project-dropdown-item ${p.id === currentId ? 'active' : ''}"
         onclick="switchProject('${p.id}')">
      <div class="dot" style="background:${p.status === 'active' ? '#10b981' : p.status === 'error' ? '#ef4444' : '#9ca3af'}"></div>
      ${p.name}
    </div>
  `).join('');

  return `
    <div class="sidebar-project">
      <button class="sidebar-project-btn" id="project-switcher-btn">
        <span>🐗</span>
        <span id="current-project-name">${project.name}</span>
        <span class="arrow">▼</span>
      </button>
      <div class="project-dropdown" id="project-dropdown">
        ${projectsHtml}
        <div class="project-dropdown-item" onclick="navigate('projects.html')" style="border-top:1px solid rgba(255,255,255,0.08);margin-top:4px">
          + All Projects
        </div>
      </div>
    </div>

    <nav class="sidebar-nav">
      ${navLinksHtml}
    </nav>

    <div class="sidebar-footer">
      <div class="user-avatar">AK</div>
      <div class="user-info">
        <div style="font-size:12px;color:#374151;font-weight:500">Alice Kim</div>
        <div class="user-email">alice@municorn.com</div>
      </div>
      <button class="sign-out-btn" onclick="signOut()" title="Sign out">↪</button>
    </div>
  `;
}

function mountNav(activePage) {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML = renderNav(activePage);
    initProjectSwitcher();
  }
}
