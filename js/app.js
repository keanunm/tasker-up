/**
 * TASKER UP! — Smart Conversational Task & Project Manager
 * Full client-side architecture with Project Folders, Custom Categories,
 * Conversational Quick-Entry, Natural Language Parsing, and LocalStorage.
 */

(function () {
  'use strict';

  // ==========================================
  // 1. CONSTANTS & DEFAULT DATA
  // ==========================================
  const STORAGE_KEY = 'tasker_up_state_v2';
  const SOUND_KEY = 'tasker_up_sound_enabled';

  const PRESET_COLORS = [
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#f43f5e', // Rose
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#84cc16', // Lime
    '#a855f7', // Purple
  ];

  const PRESET_ICONS = [
    '📁', '💼', '🚀', '🎯', '💡', '🔥', '⭐', '💻', 
    '🎨', '📊', '🛒', '🌱', '🏠', '⚡', '📝', '🔒'
  ];

  const DEFAULT_FOLDERS = [
    {
      id: 'folder-general',
      name: 'General Tasks',
      desc: 'Quick day-to-day items and quick inbox',
      color: '#6366f1',
      icon: '📁',
      createdAt: Date.now() - 36000000
    },
    {
      id: 'folder-alpha',
      name: 'Website Redesign',
      desc: 'Project Alpha redesign and frontend build',
      color: '#06b6d4',
      icon: '💻',
      createdAt: Date.now() - 25000000
    },
    {
      id: 'folder-marketing',
      name: 'Marketing Launch',
      desc: 'Quarterly campaigns, brand outreach and ads',
      color: '#f59e0b',
      icon: '🚀',
      createdAt: Date.now() - 15000000
    },
    {
      id: 'folder-personal',
      name: 'Personal Life',
      desc: 'Health, family, home, errands',
      color: '#10b981',
      icon: '🌱',
      createdAt: Date.now() - 5000000
    }
  ];

  const DEFAULT_CATEGORIES = [
    { id: 'cat-work', name: 'Work', color: '#6366f1', icon: '💼' },
    { id: 'cat-urgent', name: 'Urgent', color: '#f43f5e', icon: '🔥' },
    { id: 'cat-design', name: 'Design', color: '#ec4899', icon: '🎨' },
    { id: 'cat-ideas', name: 'Ideas', color: '#8b5cf6', icon: '💡' },
    { id: 'cat-health', name: 'Health', color: '#10b981', icon: '🌱' },
    { id: 'cat-finance', name: 'Finance', color: '#f59e0b', icon: '📊' }
  ];

  const DEFAULT_TASKS = [
    {
      id: 'task-1',
      title: 'Review new landing page designs with Kevin',
      notes: 'Check responsive typography on mobile and hero gradient alignment.',
      folderId: 'folder-alpha',
      categoryId: 'cat-design',
      priority: 'high',
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      completed: false,
      starred: true,
      createdAt: Date.now() - 7200000
    },
    {
      id: 'task-2',
      title: 'Prepare budget breakdown for Q4 ad campaign',
      notes: 'Include Google Search Ads and LinkedIn sponsored updates.',
      folderId: 'folder-marketing',
      categoryId: 'cat-finance',
      priority: 'medium',
      dueDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
      completed: false,
      starred: false,
      createdAt: Date.now() - 5000000
    },
    {
      id: 'task-3',
      title: 'Draft email blast announcing upcoming feature release',
      notes: 'Include screenshot teasers and CTA to beta signups.',
      folderId: 'folder-marketing',
      categoryId: 'cat-work',
      priority: 'high',
      dueDate: new Date().toISOString().split('T')[0], // Today
      completed: false,
      starred: true,
      createdAt: Date.now() - 3600000
    },
    {
      id: 'task-4',
      title: 'Pick up groceries & green tea on way home',
      notes: 'Olive oil, sourdough bread, almond milk, organic greens.',
      folderId: 'folder-personal',
      categoryId: 'cat-health',
      priority: 'low',
      dueDate: new Date().toISOString().split('T')[0],
      completed: true,
      starred: false,
      createdAt: Date.now() - 1800000
    },
    {
      id: 'task-5',
      title: 'Brainstorm brand mascot & logo animations',
      notes: 'Look at Lottie micro-animations and SVG paths for header icon.',
      folderId: 'folder-alpha',
      categoryId: 'cat-ideas',
      priority: 'medium',
      dueDate: '',
      completed: false,
      starred: false,
      createdAt: Date.now() - 900000
    }
  ];

  // ==========================================
  // 2. STATE MANAGEMENT
  // ==========================================
  let state = {
    folders: [],
    categories: [],
    tasks: [],
    activeView: { type: 'all', id: null }, // type: 'all' | 'today' | 'important' | 'completed' | 'folder' | 'category'
    filterState: 'all', // 'all' | 'active' | 'completed'
    searchQuery: '',
    sortBy: 'created-desc',
    soundEnabled: true,
    // Entry bar current picks:
    entry: {
      folderId: 'folder-general',
      categoryId: 'cat-work',
      priority: 'medium',
      dueDate: ''
    }
  };

  // ==========================================
  // 3. AUDIO SYNTHESIZER (WEB AUDIO API)
  // ==========================================
  const SoundFX = {
    audioCtx: null,
    init() {
      if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
    },
    playTone(freq, type, duration, gainVal = 0.08) {
      if (!state.soundEnabled) return;
      try {
        this.init();
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
      } catch (e) {
        // Audio might be blocked by browser policy until interaction
      }
    },
    add() {
      // Pleasant bubbly pop
      this.playTone(520, 'sine', 0.12, 0.08);
      setTimeout(() => this.playTone(780, 'sine', 0.16, 0.07), 60);
    },
    complete() {
      // Reward chime chord
      this.playTone(523.25, 'triangle', 0.25, 0.08); // C5
      setTimeout(() => this.playTone(659.25, 'triangle', 0.25, 0.08), 80); // E5
      setTimeout(() => this.playTone(783.99, 'triangle', 0.35, 0.09), 160); // G5
      setTimeout(() => this.playTone(1046.50, 'triangle', 0.45, 0.1), 240); // C6
    },
    uncomplete() {
      this.playTone(440, 'sine', 0.15, 0.05);
    },
    click() {
      this.playTone(600, 'sine', 0.05, 0.03);
    },
    delete() {
      this.playTone(320, 'sine', 0.15, 0.07);
      setTimeout(() => this.playTone(220, 'sine', 0.2, 0.06), 70);
    }
  };

  // ==========================================
  // 4. STORAGE HELPERS
  // ==========================================
  function loadInitialState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        state.folders = parsed.folders && parsed.folders.length ? parsed.folders : DEFAULT_FOLDERS;
        state.categories = parsed.categories && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES;
        state.tasks = parsed.tasks ? parsed.tasks : DEFAULT_TASKS;
      } else {
        state.folders = JSON.parse(JSON.stringify(DEFAULT_FOLDERS));
        state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        state.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
        saveState();
      }
    } catch (err) {
      console.error('Failed to load state from localStorage', err);
      state.folders = JSON.parse(JSON.stringify(DEFAULT_FOLDERS));
      state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      state.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
    }

    const soundSetting = localStorage.getItem(SOUND_KEY);
    if (soundSetting !== null) {
      state.soundEnabled = soundSetting === 'true';
    }

    // Default entry folder & category fallback
    if (state.folders.length > 0) {
      state.entry.folderId = state.folders[0].id;
    }
    if (state.categories.length > 0) {
      state.entry.categoryId = state.categories[0].id;
    }
  }

  function saveState(skipCloud = false) {
    try {
      const payload = {
        folders: state.folders,
        categories: state.categories,
        tasks: state.tasks
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

      if (!skipCloud && window.CloudSync && typeof window.CloudSync.queueCloudSave === 'function') {
        window.CloudSync.queueCloudSave(payload);
      }
    } catch (e) {
      console.error('Storage write error', e);
    }
  }

  // ==========================================
  // 5. NATURAL LANGUAGE & SMART MESSAGE PARSER
  // ==========================================
  /**
   * Parses conversational input like:
   * "Finish pitch deck for investors #Work @Client Alpha !high ^tomorrow"
   * Extracts tags:
   *   #tag -> Category name (finds or creates)
   *   @folder -> Folder name (finds or creates)
   *   !high / !medium / !low / !urgent / !p1 -> Priority
   *   ^today / ^tomorrow / ^friday / ^YYYY-MM-DD -> Due date
   */
  function parseConversationalMessage(rawInput) {
    let text = rawInput.trim();
    let detectedCategory = null;
    let detectedFolder = null;
    let detectedPriority = null;
    let detectedDueDate = null;

    // 1. Detect Priority (!high, !medium, !low, !urgent, !p1, !p2, !p3)
    const priorityRegex = /(?:^|\s)!([a-zA-Z0-9]+)/gi;
    text = text.replace(priorityRegex, (match, p) => {
      const pLower = p.toLowerCase();
      if (['high', 'urgent', 'p1', 'crit', 'critical'].includes(pLower)) {
        detectedPriority = 'high';
      } else if (['med', 'medium', 'p2', 'norm', 'normal'].includes(pLower)) {
        detectedPriority = 'medium';
      } else if (['low', 'p3', 'minor'].includes(pLower)) {
        detectedPriority = 'low';
      }
      return '';
    });

    // 2. Detect Due Date (^today, ^tomorrow, ^2026-10-25)
    const dueRegex = /(?:^|\s)\^([a-zA-Z0-9\-_]+)/gi;
    text = text.replace(dueRegex, (match, d) => {
      const dLower = d.toLowerCase();
      const now = new Date();
      if (dLower === 'today') {
        detectedDueDate = now.toISOString().split('T')[0];
      } else if (dLower === 'tomorrow') {
        const tmrw = new Date(now.getTime() + 86400000);
        detectedDueDate = tmrw.toISOString().split('T')[0];
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        detectedDueDate = d;
      }
      return '';
    });

    // 3. Detect Folder (@folderName or @"project name")
    const folderRegex = /(?:^|\s)@(?:\"([^\"]+)\"|([a-zA-Z0-9_\-]+))/g;
    text = text.replace(folderRegex, (match, quoted, word) => {
      const name = (quoted || word).trim();
      if (name) {
        detectedFolder = name;
      }
      return '';
    });

    // 4. Detect Category (#categoryName or #"category name")
    const catRegex = /(?:^|\s)#(?:\"([^\"]+)\"|([a-zA-Z0-9_\-]+))/g;
    text = text.replace(catRegex, (match, quoted, word) => {
      const name = (quoted || word).trim();
      if (name) {
        detectedCategory = name;
      }
      return '';
    });

    // Clean remaining task title
    const cleanTitle = text.replace(/\s+/g, ' ').trim();

    return {
      title: cleanTitle || rawInput.trim(),
      folderName: detectedFolder,
      categoryName: detectedCategory,
      priority: detectedPriority,
      dueDate: detectedDueDate
    };
  }

  // ==========================================
  // 6. DOM ELEMENTS CACHE
  // ==========================================
  const dom = {
    // Mobile
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    mobileStatsBtn: document.getElementById('mobileStatsBtn'),
    sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
    sidebar: document.getElementById('sidebar'),

    // Sidebar lists
    systemViewsList: document.getElementById('systemViewsList'),
    foldersList: document.getElementById('foldersList'),
    categoriesList: document.getElementById('categoriesList'),
    countAll: document.getElementById('count-all'),
    countToday: document.getElementById('count-today'),
    countImportant: document.getElementById('count-important'),
    countCompleted: document.getElementById('count-completed'),

    // Sidebar buttons
    openNewFolderModalBtn: document.getElementById('openNewFolderModalBtn'),
    openNewCategoryModalBtn: document.getElementById('openNewCategoryModalBtn'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundIcon: document.getElementById('soundIcon'),
    backupDataBtn: document.getElementById('backupDataBtn'),

    // Top bar
    currentViewBadge: document.getElementById('currentViewBadge'),
    currentViewTitle: document.getElementById('currentViewTitle'),
    currentViewDescription: document.getElementById('currentViewDescription'),
    taskSearchInput: document.getElementById('taskSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    statsPillText: document.getElementById('statsPillText'),
    headerProgressArc: document.getElementById('headerProgressArc'),

    // Conversational Quick Add Card
    quickEntryForm: document.getElementById('quickEntryForm'),
    taskMessageInput: document.getElementById('taskMessageInput'),
    voiceInputBtn: document.getElementById('voiceInputBtn'),
    submitTaskBtn: document.getElementById('submitTaskBtn'),

    // Chips & Popovers
    entryFolderBtn: document.getElementById('entryFolderBtn'),
    entryFolderIcon: document.getElementById('entryFolderIcon'),
    entryFolderLabel: document.getElementById('entryFolderLabel'),
    entryFolderDropdown: document.getElementById('entryFolderDropdown'),

    entryCategoryBtn: document.getElementById('entryCategoryBtn'),
    entryCategoryDot: document.getElementById('entryCategoryDot'),
    entryCategoryLabel: document.getElementById('entryCategoryLabel'),
    entryCategoryDropdown: document.getElementById('entryCategoryDropdown'),

    entryPriorityBtn: document.getElementById('entryPriorityBtn'),
    entryPriorityDot: document.getElementById('entryPriorityDot'),
    entryPriorityLabel: document.getElementById('entryPriorityLabel'),
    entryPriorityDropdown: document.getElementById('entryPriorityDropdown'),

    entryDueDateInput: document.getElementById('entryDueDateInput'),
    entryDueDateLabel: document.getElementById('entryDueDateLabel'),
    quickAddCatShortcutBtn: document.getElementById('quickAddCatShortcutBtn'),

    // Strip controls & filters
    activeFilterTags: document.getElementById('activeFilterTags'),
    taskSortSelect: document.getElementById('taskSortSelect'),
    viewAllStateBtn: document.getElementById('viewAllStateBtn'),
    viewActiveStateBtn: document.getElementById('viewActiveStateBtn'),
    viewCompletedStateBtn: document.getElementById('viewCompletedStateBtn'),

    // Task List Container
    taskListContainer: document.getElementById('taskListContainer'),
    emptyState: document.getElementById('emptyState'),
    emptyStateAddBtn: document.getElementById('emptyStateAddBtn'),

    // Category Modal
    categoryModal: document.getElementById('categoryModal'),
    categoryModalTitle: document.getElementById('categoryModalTitle'),
    closeCategoryModalBtn: document.getElementById('closeCategoryModalBtn'),
    cancelCategoryModalBtn: document.getElementById('cancelCategoryModalBtn'),
    categoryForm: document.getElementById('categoryForm'),
    editCategoryId: document.getElementById('editCategoryId'),
    categoryNameInput: document.getElementById('categoryNameInput'),
    categoryColorPicker: document.getElementById('categoryColorPicker'),
    categoryIconPicker: document.getElementById('categoryIconPicker'),
    categoryPreviewPill: document.getElementById('categoryPreviewPill'),

    // Folder Modal
    folderModal: document.getElementById('folderModal'),
    folderModalTitle: document.getElementById('folderModalTitle'),
    closeFolderModalBtn: document.getElementById('closeFolderModalBtn'),
    cancelFolderModalBtn: document.getElementById('cancelFolderModalBtn'),
    folderForm: document.getElementById('folderForm'),
    editFolderId: document.getElementById('editFolderId'),
    folderNameInput: document.getElementById('folderNameInput'),
    folderDescInput: document.getElementById('folderDescInput'),
    folderColorPicker: document.getElementById('folderColorPicker'),
    folderIconPicker: document.getElementById('folderIconPicker'),

    // Task Edit Modal
    taskEditModal: document.getElementById('taskEditModal'),
    closeTaskEditModalBtn: document.getElementById('closeTaskEditModalBtn'),
    cancelTaskEditModalBtn: document.getElementById('cancelTaskEditModalBtn'),
    taskEditForm: document.getElementById('taskEditForm'),
    editTaskId: document.getElementById('editTaskId'),
    editTaskTitleInput: document.getElementById('editTaskTitleInput'),
    editTaskNotesInput: document.getElementById('editTaskNotesInput'),
    editTaskFolderSelect: document.getElementById('editTaskFolderSelect'),
    editTaskCategorySelect: document.getElementById('editTaskCategorySelect'),
    editTaskPrioritySelect: document.getElementById('editTaskPrioritySelect'),
    editTaskDueDateInput: document.getElementById('editTaskDueDateInput'),
    deleteTaskFromEditBtn: document.getElementById('deleteTaskFromEditBtn'),

    // Backup Modal
    backupModal: document.getElementById('backupModal'),
    closeBackupModalBtn: document.getElementById('closeBackupModalBtn'),
    exportDataBtn: document.getElementById('exportDataBtn'),
    importDataFileInput: document.getElementById('importDataFileInput'),
    resetDemoDataBtn: document.getElementById('resetDemoDataBtn'),

    // Toasts
    toastContainer: document.getElementById('toastContainer')
  };

  // Temporary modal selection state
  let selectedModalColor = PRESET_COLORS[0];
  let selectedModalIcon = PRESET_ICONS[0];

  // ==========================================
  // 7. TOAST NOTIFICATIONS
  // ==========================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '🛑';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'all 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // ==========================================
  // 8. RENDER & UI SYNC METHODS
  // ==========================================

  function renderAll() {
    renderSidebarCounts();
    renderFoldersList();
    renderCategoriesList();
    renderTopHeader();
    renderEntryChips();
    renderTasks();
  }

  /**
   * Update sidebar counts for System Views
   */
  function renderSidebarCounts() {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.completed).length;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = state.tasks.filter(t => !t.completed && t.dueDate === todayStr).length;
    const importantCount = state.tasks.filter(t => !t.completed && (t.starred || t.priority === 'high')).length;

    dom.countAll.textContent = total;
    dom.countToday.textContent = todayCount;
    dom.countImportant.textContent = importantCount;
    dom.countCompleted.textContent = completed;

    // Header progress arc & ratio
    const completionPercent = total === 0 ? 0 : Math.round((completed / total) * 100);
    dom.statsPillText.textContent = `${completed}/${total} done (${completionPercent}%)`;
    if (dom.headerProgressArc) {
      dom.headerProgressArc.setAttribute('stroke-dasharray', `${completionPercent}, 100`);
    }

    // Active system view highlight
    document.querySelectorAll('#systemViewsList .nav-item').forEach(btn => {
      const viewType = btn.dataset.view;
      if (state.activeView.type === viewType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Render Folder items in Sidebar
   */
  function renderFoldersList() {
    dom.foldersList.innerHTML = '';
    state.folders.forEach(folder => {
      const count = state.tasks.filter(t => t.folderId === folder.id && !t.completed).length;
      const isActive = state.activeView.type === 'folder' && state.activeView.id === folder.id;

      const item = document.createElement('div');
      item.className = `folder-item ${isActive ? 'active' : ''}`;
      item.innerHTML = `
        <div class="folder-item-left" title="${escapeHtml(folder.desc || folder.name)}">
          <span class="folder-badge-icon" style="background-color: ${folder.color}22; color: ${folder.color}">
            ${folder.icon || '📁'}
          </span>
          <span class="nav-label">${escapeHtml(folder.name)}</span>
        </div>
        <span class="nav-count">${count}</span>
        <div class="folder-actions-hover">
          <button class="mini-action-btn edit-folder-btn" title="Edit folder">✏️</button>
          <button class="mini-action-btn delete delete-folder-btn" title="Delete folder">🗑️</button>
        </div>
      `;

      // Select folder view on click
      item.querySelector('.folder-item-left').addEventListener('click', () => {
        state.activeView = { type: 'folder', id: folder.id };
        state.entry.folderId = folder.id; // Also sync entry folder default
        renderAll();
        SoundFX.click();
        closeMobileSidebar();
      });

      // Edit folder
      item.querySelector('.edit-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openFolderModal(folder);
      });

      // Delete folder
      item.querySelector('.delete-folder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteFolder(folder);
      });

      dom.foldersList.appendChild(item);
    });
  }

  /**
   * Render Category items in Sidebar
   */
  function renderCategoriesList() {
    dom.categoriesList.innerHTML = '';
    state.categories.forEach(cat => {
      const count = state.tasks.filter(t => t.categoryId === cat.id && !t.completed).length;
      const isActive = state.activeView.type === 'category' && state.activeView.id === cat.id;

      const item = document.createElement('div');
      item.className = `category-item ${isActive ? 'active' : ''}`;
      item.innerHTML = `
        <div class="category-item-left">
          <span class="category-dot" style="background-color: ${cat.color}; color: ${cat.color}"></span>
          <span class="category-icon-sym">${cat.icon || '🏷️'}</span>
          <span class="nav-label">${escapeHtml(cat.name)}</span>
        </div>
        <span class="nav-count">${count}</span>
        <div class="folder-actions-hover">
          <button class="mini-action-btn edit-cat-btn" title="Edit category">✏️</button>
          <button class="mini-action-btn delete delete-cat-btn" title="Delete category">🗑️</button>
        </div>
      `;

      item.querySelector('.category-item-left').addEventListener('click', () => {
        state.activeView = { type: 'category', id: cat.id };
        state.entry.categoryId = cat.id; // Also sync entry category default
        renderAll();
        SoundFX.click();
        closeMobileSidebar();
      });

      item.querySelector('.edit-cat-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openCategoryModal(cat);
      });

      item.querySelector('.delete-cat-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteCategory(cat);
      });

      dom.categoriesList.appendChild(item);
    });
  }

  /**
   * Render Top Header Info & Active Filter Badges
   */
  function renderTopHeader() {
    let title = 'All Tasks';
    let badge = 'Workspace';
    let desc = 'Showing all open & completed items across your projects';

    if (state.activeView.type === 'today') {
      badge = 'Smart View';
      title = 'Today’s Focus';
      desc = 'Tasks scheduled for completion today';
    } else if (state.activeView.type === 'important') {
      badge = 'Smart View';
      title = 'Priority & Starred';
      desc = 'Urgent action items requiring your high attention';
    } else if (state.activeView.type === 'completed') {
      badge = 'Archive';
      title = 'Completed Tasks';
      desc = 'All finished achievements across your folders';
    } else if (state.activeView.type === 'folder') {
      const folder = state.folders.find(f => f.id === state.activeView.id);
      if (folder) {
        badge = `Project: ${folder.icon}`;
        title = folder.name;
        desc = folder.desc || `All tasks assigned to project ${folder.name}`;
      }
    } else if (state.activeView.type === 'category') {
      const cat = state.categories.find(c => c.id === state.activeView.id);
      if (cat) {
        badge = `Category: ${cat.icon}`;
        title = `${cat.name}`;
        desc = `All tasks classified under #${cat.name}`;
      }
    }

    dom.currentViewBadge.textContent = badge;
    dom.currentViewTitle.textContent = title;
    dom.currentViewDescription.textContent = desc;

    // Active filter tags strip
    dom.activeFilterTags.innerHTML = '';

    // If searching
    if (state.searchQuery) {
      const searchTag = createFilterBadge(`Search: "${state.searchQuery}"`, () => {
        state.searchQuery = '';
        dom.taskSearchInput.value = '';
        renderAll();
      });
      dom.activeFilterTags.appendChild(searchTag);
    }

    // If active view is folder or category
    if (state.activeView.type === 'folder') {
      const folder = state.folders.find(f => f.id === state.activeView.id);
      if (folder) {
        const tag = createFilterBadge(`📁 ${folder.name}`, () => {
          state.activeView = { type: 'all', id: null };
          renderAll();
        });
        dom.activeFilterTags.appendChild(tag);
      }
    } else if (state.activeView.type === 'category') {
      const cat = state.categories.find(c => c.id === state.activeView.id);
      if (cat) {
        const tag = createFilterBadge(`🏷️ ${cat.name}`, () => {
          state.activeView = { type: 'all', id: null };
          renderAll();
        });
        dom.activeFilterTags.appendChild(tag);
      }
    }
  }

  function createFilterBadge(text, onRemove) {
    const span = document.createElement('span');
    span.className = 'filter-chip-badge';
    span.innerHTML = `<span>${escapeHtml(text)}</span><button class="filter-chip-remove" title="Clear filter">×</button>`;
    span.querySelector('.filter-chip-remove').addEventListener('click', onRemove);
    return span;
  }

  /**
   * Sync Quick-Add Chips with current state.entry
   */
  function renderEntryChips() {
    // 1. Folder Chip
    const activeFolder = state.folders.find(f => f.id === state.entry.folderId) || state.folders[0];
    if (activeFolder) {
      state.entry.folderId = activeFolder.id;
      dom.entryFolderIcon.textContent = activeFolder.icon || '📁';
      dom.entryFolderLabel.textContent = `Folder: ${activeFolder.name}`;
    }

    // Populate Folder Dropdown
    dom.entryFolderDropdown.innerHTML = '';
    state.folders.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dropdown-item ${f.id === state.entry.folderId ? 'active' : ''}`;
      btn.innerHTML = `<span>${f.icon || '📁'}</span><span>${escapeHtml(f.name)}</span>`;
      btn.addEventListener('click', () => {
        state.entry.folderId = f.id;
        renderEntryChips();
        closeAllDropdowns();
        SoundFX.click();
      });
      dom.entryFolderDropdown.appendChild(btn);
    });

    // 2. Category Chip
    const activeCat = state.categories.find(c => c.id === state.entry.categoryId) || state.categories[0];
    if (activeCat) {
      state.entry.categoryId = activeCat.id;
      dom.entryCategoryDot.style.backgroundColor = activeCat.color;
      dom.entryCategoryLabel.textContent = `${activeCat.icon} ${activeCat.name}`;
    }

    // Populate Category Dropdown
    dom.entryCategoryDropdown.innerHTML = '';
    state.categories.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dropdown-item ${c.id === state.entry.categoryId ? 'active' : ''}`;
      btn.innerHTML = `
        <span class="chip-color-dot" style="background-color: ${c.color}"></span>
        <span>${c.icon || '🏷️'}</span>
        <span>${escapeHtml(c.name)}</span>
      `;
      btn.addEventListener('click', () => {
        state.entry.categoryId = c.id;
        renderEntryChips();
        closeAllDropdowns();
        SoundFX.click();
      });
      dom.entryCategoryDropdown.appendChild(btn);
    });

    // 3. Priority Chip
    const prio = state.entry.priority || 'medium';
    dom.entryPriorityDot.className = `priority-dot priority-${prio}`;
    const prioLabels = { low: 'Low', medium: 'Normal', high: 'Urgent' };
    dom.entryPriorityLabel.textContent = `Priority: ${prioLabels[prio]}`;

    // 4. Due Date
    if (state.entry.dueDate) {
      dom.entryDueDateLabel.textContent = formatDuePretty(state.entry.dueDate);
      dom.entryDueDateInput.value = state.entry.dueDate;
    } else {
      dom.entryDueDateLabel.textContent = 'No Due Date';
      dom.entryDueDateInput.value = '';
    }
  }

  /**
   * Filter and Sort tasks and render to container
   */
  function renderTasks() {
    let tasks = [...state.tasks];

    // 1. Filter by Active View
    if (state.activeView.type === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      tasks = tasks.filter(t => t.dueDate === todayStr);
    } else if (state.activeView.type === 'important') {
      tasks = tasks.filter(t => t.starred || t.priority === 'high');
    } else if (state.activeView.type === 'completed') {
      tasks = tasks.filter(t => t.completed);
    } else if (state.activeView.type === 'folder') {
      tasks = tasks.filter(t => t.folderId === state.activeView.id);
    } else if (state.activeView.type === 'category') {
      tasks = tasks.filter(t => t.categoryId === state.activeView.id);
    }

    // 2. Filter by State (All / Active / Completed)
    if (state.filterState === 'active') {
      tasks = tasks.filter(t => !t.completed);
    } else if (state.filterState === 'completed') {
      tasks = tasks.filter(t => t.completed);
    }

    // 3. Search query filter
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      tasks = tasks.filter(t => {
        const folder = state.folders.find(f => f.id === t.folderId);
        const cat = state.categories.find(c => c.id === t.categoryId);
        return (
          t.title.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q)) ||
          (folder && folder.name.toLowerCase().includes(q)) ||
          (cat && cat.name.toLowerCase().includes(q))
        );
      });
    }

    // 4. Sorting
    tasks.sort((a, b) => {
      // Always put incomplete tasks first unless viewing completed exclusively
      if (state.activeView.type !== 'completed' && state.filterState !== 'completed') {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
      }

      // Starred on top
      if (a.starred !== b.starred) {
        return a.starred ? -1 : 1;
      }

      if (state.sortBy === 'created-asc') {
        return a.createdAt - b.createdAt;
      } else if (state.sortBy === 'priority-desc') {
        const weights = { high: 3, medium: 2, low: 1 };
        return (weights[b.priority] || 2) - (weights[a.priority] || 2);
      } else if (state.sortBy === 'due-asc') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      } else if (state.sortBy === 'title-asc') {
        return a.title.localeCompare(b.title);
      } else {
        // default: created-desc
        return b.createdAt - a.createdAt;
      }
    });

    dom.taskListContainer.innerHTML = '';

    if (tasks.length === 0) {
      dom.emptyState.style.display = 'block';
    } else {
      dom.emptyState.style.display = 'none';
      tasks.forEach(task => {
        dom.taskListContainer.appendChild(createTaskElement(task));
      });
    }
  }

  /**
   * Create single Task DOM node
   */
  function createTaskElement(task) {
    const el = document.createElement('div');
    el.className = `task-item ${task.completed ? 'completed' : ''}`;
    el.dataset.id = task.id;

    const folder = state.folders.find(f => f.id === task.folderId) || { name: 'Unassigned', icon: '📁', color: '#6366f1' };
    const category = state.categories.find(c => c.id === task.categoryId) || { name: 'None', icon: '🏷️', color: '#64748b' };

    // Due date badge formatting
    let dueBadgeHtml = '';
    if (task.dueDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      let dueClass = '';
      if (!task.completed) {
        if (task.dueDate < todayStr) dueClass = 'overdue';
        else if (task.dueDate === todayStr) dueClass = 'today';
      }
      dueBadgeHtml = `<span class="tag-badge due-badge ${dueClass}">📅 ${formatDuePretty(task.dueDate)}</span>`;
    }

    // Priority badge
    const priorityLabels = { high: 'Urgent', medium: 'Normal', low: 'Low' };
    const priorityBadgeHtml = `<span class="tag-badge priority-badge p-${task.priority}">${priorityLabels[task.priority] || 'Normal'}</span>`;

    el.innerHTML = `
      <div class="task-checkbox-wrap">
        <button class="task-checkbox" aria-label="Toggle task status" title="${task.completed ? 'Mark active' : 'Mark complete'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>

      <div class="task-body">
        <span class="task-title">${escapeHtml(task.title)}</span>
        ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ''}

        <div class="task-tags-row">
          <span class="tag-badge folder-badge" title="Filter by folder: ${escapeHtml(folder.name)}">
            <span>${folder.icon}</span>
            <span>${escapeHtml(folder.name)}</span>
          </span>

          <span class="tag-badge category-badge" style="background-color: ${category.color}18; color: ${category.color}; border-color: ${category.color}35;" title="Filter by category: ${escapeHtml(category.name)}">
            <span>${category.icon}</span>
            <span>${escapeHtml(category.name)}</span>
          </span>

          ${priorityBadgeHtml}
          ${dueBadgeHtml}
        </div>
      </div>

      <div class="task-actions">
        <button class="action-icon-btn star-btn ${task.starred ? 'starred' : ''}" title="${task.starred ? 'Unstar task' : 'Star task'}">
          ${task.starred ? '★' : '☆'}
        </button>
        <button class="action-icon-btn edit-btn" title="Edit task details">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="action-icon-btn delete-btn" title="Delete task">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // Event: Toggle completed checkbox
    el.querySelector('.task-checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTaskCompletion(task.id);
    });

    // Event: Click title to edit
    el.querySelector('.task-title').addEventListener('click', () => {
      openTaskEditModal(task);
    });

    // Event: Quick Filter click on Folder badge
    el.querySelector('.folder-badge').addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeView = { type: 'folder', id: task.folderId };
      renderAll();
      SoundFX.click();
    });

    // Event: Quick Filter click on Category badge
    el.querySelector('.category-badge').addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeView = { type: 'category', id: task.categoryId };
      renderAll();
      SoundFX.click();
    });

    // Event: Toggle Star
    el.querySelector('.star-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTaskStar(task.id);
    });

    // Event: Edit Task
    el.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openTaskEditModal(task);
    });

    // Event: Delete Task
    el.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });

    return el;
  }

  // ==========================================
  // 9. TASK ACTIONS
  // ==========================================

  function addNewTaskFromMessage(messageText) {
    if (!messageText || !messageText.trim()) return;

    // Run conversational smart parser
    const parsed = parseConversationalMessage(messageText);

    if (!parsed.title) {
      showToast('Please type a task message', 'warning');
      return;
    }

    // Determine Folder:
    // If user specified @folderName, find or auto-create that folder!
    let targetFolderId = state.entry.folderId;
    if (parsed.folderName) {
      const existingFolder = state.folders.find(
        f => f.name.toLowerCase() === parsed.folderName.toLowerCase()
      );
      if (existingFolder) {
        targetFolderId = existingFolder.id;
      } else {
        // Auto-create folder for the user
        const newFolder = {
          id: 'folder-' + Date.now(),
          name: parsed.folderName,
          desc: 'Created via smart message',
          color: PRESET_COLORS[state.folders.length % PRESET_COLORS.length],
          icon: '📁',
          createdAt: Date.now()
        };
        state.folders.push(newFolder);
        targetFolderId = newFolder.id;
        showToast(`Created new Project folder: "${parsed.folderName}"`, 'info');
      }
    }

    // Determine Category:
    // If user specified #categoryName, find or auto-create!
    let targetCategoryId = state.entry.categoryId;
    if (parsed.categoryName) {
      const existingCat = state.categories.find(
        c => c.name.toLowerCase() === parsed.categoryName.toLowerCase()
      );
      if (existingCat) {
        targetCategoryId = existingCat.id;
      } else {
        // Auto-create category for user
        const newCat = {
          id: 'cat-' + Date.now(),
          name: parsed.categoryName,
          color: PRESET_COLORS[state.categories.length % PRESET_COLORS.length],
          icon: '🏷️'
        };
        state.categories.push(newCat);
        targetCategoryId = newCat.id;
        showToast(`Created new Category: "${parsed.categoryName}"`, 'info');
      }
    }

    // Determine Priority:
    const targetPriority = parsed.priority || state.entry.priority || 'medium';

    // Determine Due Date:
    const targetDueDate = parsed.dueDate || state.entry.dueDate || '';

    const newTask = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      title: parsed.title,
      notes: '',
      folderId: targetFolderId,
      categoryId: targetCategoryId,
      priority: targetPriority,
      dueDate: targetDueDate,
      completed: false,
      starred: targetPriority === 'high',
      createdAt: Date.now()
    };

    state.tasks.unshift(newTask);
    saveState();

    // Reset entry message input
    dom.taskMessageInput.value = '';
    dom.taskMessageInput.style.height = 'auto';

    SoundFX.add();
    showToast('Task added to your workspace!', 'success');
    renderAll();
  }

  function toggleTaskCompletion(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    saveState();

    if (task.completed) {
      SoundFX.complete();
      showToast(`Completed: "${task.title.substring(0, 24)}..."`, 'success');
    } else {
      SoundFX.uncomplete();
    }

    renderAll();
  }

  function toggleTaskStar(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.starred = !task.starred;
    saveState();
    SoundFX.click();
    renderAll();
  }

  function deleteTask(taskId) {
    const idx = state.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    state.tasks.splice(idx, 1);
    saveState();
    SoundFX.delete();
    showToast('Task deleted', 'info');
    renderAll();
  }

  // ==========================================
  // 10. CATEGORY MANAGEMENT MODAL & LOGIC
  // ==========================================

  function initCategoryModalUI() {
    // Render color swatches
    dom.categoryColorPicker.innerHTML = '';
    PRESET_COLORS.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      swatch.addEventListener('click', () => {
        selectedModalColor = color;
        updateCategoryModalSwatches();
        updateCategoryPreview();
      });
      dom.categoryColorPicker.appendChild(swatch);
    });

    // Render preset icons
    dom.categoryIconPicker.innerHTML = '';
    PRESET_ICONS.forEach(icon => {
      const opt = document.createElement('div');
      opt.className = 'icon-option';
      opt.textContent = icon;
      opt.dataset.icon = icon;
      opt.addEventListener('click', () => {
        selectedModalIcon = icon;
        updateCategoryModalIcons();
        updateCategoryPreview();
      });
      dom.categoryIconPicker.appendChild(opt);
    });

    dom.categoryNameInput.addEventListener('input', updateCategoryPreview);
  }

  function updateCategoryModalSwatches() {
    dom.categoryColorPicker.querySelectorAll('.color-swatch').forEach(s => {
      if (s.dataset.color === selectedModalColor) {
        s.classList.add('selected');
      } else {
        s.classList.remove('selected');
      }
    });
  }

  function updateCategoryModalIcons() {
    dom.categoryIconPicker.querySelectorAll('.icon-option').forEach(opt => {
      if (opt.dataset.icon === selectedModalIcon) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });
  }

  function updateCategoryPreview() {
    const name = dom.categoryNameInput.value.trim() || 'Preview Category';
    dom.categoryPreviewPill.style.backgroundColor = `${selectedModalColor}20`;
    dom.categoryPreviewPill.style.color = selectedModalColor;
    dom.categoryPreviewPill.style.borderColor = `${selectedModalColor}50`;
    dom.categoryPreviewPill.querySelector('.cat-pill-icon').textContent = selectedModalIcon;
    dom.categoryPreviewPill.querySelector('.cat-pill-name').textContent = name;
  }

  function openCategoryModal(existingCategory = null) {
    initCategoryModalUI();

    if (existingCategory) {
      dom.categoryModalTitle.textContent = 'Edit Category';
      dom.editCategoryId.value = existingCategory.id;
      dom.categoryNameInput.value = existingCategory.name;
      selectedModalColor = existingCategory.color || PRESET_COLORS[0];
      selectedModalIcon = existingCategory.icon || '🏷️';
    } else {
      dom.categoryModalTitle.textContent = 'Create New Category';
      dom.editCategoryId.value = '';
      dom.categoryNameInput.value = '';
      selectedModalColor = PRESET_COLORS[state.categories.length % PRESET_COLORS.length];
      selectedModalIcon = '🏷️';
    }

    updateCategoryModalSwatches();
    updateCategoryModalIcons();
    updateCategoryPreview();

    dom.categoryModal.classList.add('open');
    dom.categoryNameInput.focus();
  }

  function closeCategoryModal() {
    dom.categoryModal.classList.remove('open');
  }

  function saveCategory(e) {
    e.preventDefault();
    const name = dom.categoryNameInput.value.trim();
    if (!name) return;

    const editId = dom.editCategoryId.value;

    if (editId) {
      // Edit
      const cat = state.categories.find(c => c.id === editId);
      if (cat) {
        cat.name = name;
        cat.color = selectedModalColor;
        cat.icon = selectedModalIcon;
        showToast(`Category "${name}" updated`, 'success');
      }
    } else {
      // Create new
      const newCat = {
        id: 'cat-' + Date.now(),
        name: name,
        color: selectedModalColor,
        icon: selectedModalIcon
      };
      state.categories.push(newCat);
      state.entry.categoryId = newCat.id; // Switch quick-add chip to this new category
      showToast(`Created category "${name}"`, 'success');
    }

    saveState();
    closeCategoryModal();
    SoundFX.add();
    renderAll();
  }

  function confirmDeleteCategory(cat) {
    if (state.categories.length <= 1) {
      showToast('You must keep at least one category', 'warning');
      return;
    }
    const count = state.tasks.filter(t => t.categoryId === cat.id).length;
    const msg = count > 0 
      ? `Are you sure you want to delete category "${cat.name}"? ${count} tasks using it will be moved to another category.`
      : `Delete category "${cat.name}"?`;

    if (confirm(msg)) {
      state.categories = state.categories.filter(c => c.id !== cat.id);
      // Migrate orphaned tasks to first available category
      const fallbackCat = state.categories[0];
      state.tasks.forEach(t => {
        if (t.categoryId === cat.id) {
          t.categoryId = fallbackCat.id;
        }
      });
      if (state.activeView.type === 'category' && state.activeView.id === cat.id) {
        state.activeView = { type: 'all', id: null };
      }
      if (state.entry.categoryId === cat.id) {
        state.entry.categoryId = fallbackCat.id;
      }
      saveState();
      SoundFX.delete();
      showToast(`Deleted category "${cat.name}"`, 'info');
      renderAll();
    }
  }

  // ==========================================
  // 11. FOLDER (PROJECT) MANAGEMENT MODAL & LOGIC
  // ==========================================

  function initFolderModalUI() {
    dom.folderColorPicker.innerHTML = '';
    PRESET_COLORS.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.dataset.color = color;
      swatch.addEventListener('click', () => {
        selectedModalColor = color;
        updateFolderModalSwatches();
      });
      dom.folderColorPicker.appendChild(swatch);
    });

    dom.folderIconPicker.innerHTML = '';
    PRESET_ICONS.forEach(icon => {
      const opt = document.createElement('div');
      opt.className = 'icon-option';
      opt.textContent = icon;
      opt.dataset.icon = icon;
      opt.addEventListener('click', () => {
        selectedModalIcon = icon;
        updateFolderModalIcons();
      });
      dom.folderIconPicker.appendChild(opt);
    });
  }

  function updateFolderModalSwatches() {
    dom.folderColorPicker.querySelectorAll('.color-swatch').forEach(s => {
      if (s.dataset.color === selectedModalColor) {
        s.classList.add('selected');
      } else {
        s.classList.remove('selected');
      }
    });
  }

  function updateFolderModalIcons() {
    dom.folderIconPicker.querySelectorAll('.icon-option').forEach(opt => {
      if (opt.dataset.icon === selectedModalIcon) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });
  }

  function openFolderModal(existingFolder = null) {
    initFolderModalUI();

    if (existingFolder) {
      dom.folderModalTitle.textContent = 'Edit Project Folder';
      dom.editFolderId.value = existingFolder.id;
      dom.folderNameInput.value = existingFolder.name;
      dom.folderDescInput.value = existingFolder.desc || '';
      selectedModalColor = existingFolder.color || PRESET_COLORS[0];
      selectedModalIcon = existingFolder.icon || '📁';
    } else {
      dom.folderModalTitle.textContent = 'Create New Project Folder';
      dom.editFolderId.value = '';
      dom.folderNameInput.value = '';
      dom.folderDescInput.value = '';
      selectedModalColor = PRESET_COLORS[(state.folders.length + 2) % PRESET_COLORS.length];
      selectedModalIcon = '📁';
    }

    updateFolderModalSwatches();
    updateFolderModalIcons();

    dom.folderModal.classList.add('open');
    dom.folderNameInput.focus();
  }

  function closeFolderModal() {
    dom.folderModal.classList.remove('open');
  }

  function saveFolder(e) {
    e.preventDefault();
    const name = dom.folderNameInput.value.trim();
    if (!name) return;

    const desc = dom.folderDescInput.value.trim();
    const editId = dom.editFolderId.value;

    if (editId) {
      // Edit
      const folder = state.folders.find(f => f.id === editId);
      if (folder) {
        folder.name = name;
        folder.desc = desc;
        folder.color = selectedModalColor;
        folder.icon = selectedModalIcon;
        showToast(`Folder "${name}" updated`, 'success');
      }
    } else {
      // Create
      const newFolder = {
        id: 'folder-' + Date.now(),
        name: name,
        desc: desc,
        color: selectedModalColor,
        icon: selectedModalIcon,
        createdAt: Date.now()
      };
      state.folders.push(newFolder);
      state.entry.folderId = newFolder.id; // Set current quick-add folder
      state.activeView = { type: 'folder', id: newFolder.id }; // Switch view to new project
      showToast(`Created project folder "${name}"`, 'success');
    }

    saveState();
    closeFolderModal();
    SoundFX.add();
    renderAll();
  }

  function confirmDeleteFolder(folder) {
    if (state.folders.length <= 1) {
      showToast('You must keep at least one project folder', 'warning');
      return;
    }

    const count = state.tasks.filter(t => t.folderId === folder.id).length;
    const msg = count > 0 
      ? `Are you sure you want to delete folder "${folder.name}"? ${count} tasks will be moved to your primary folder.`
      : `Delete folder "${folder.name}"?`;

    if (confirm(msg)) {
      state.folders = state.folders.filter(f => f.id !== folder.id);
      const fallback = state.folders[0];
      state.tasks.forEach(t => {
        if (t.folderId === folder.id) {
          t.folderId = fallback.id;
        }
      });
      if (state.activeView.type === 'folder' && state.activeView.id === folder.id) {
        state.activeView = { type: 'all', id: null };
      }
      if (state.entry.folderId === folder.id) {
        state.entry.folderId = fallback.id;
      }
      saveState();
      SoundFX.delete();
      showToast(`Deleted folder "${folder.name}"`, 'info');
      renderAll();
    }
  }

  // ==========================================
  // 12. TASK EDIT MODAL
  // ==========================================

  function openTaskEditModal(task) {
    dom.editTaskId.value = task.id;
    dom.editTaskTitleInput.value = task.title;
    dom.editTaskNotesInput.value = task.notes || '';

    // Populate Folder options
    dom.editTaskFolderSelect.innerHTML = '';
    state.folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.icon} ${f.name}`;
      if (f.id === task.folderId) opt.selected = true;
      dom.editTaskFolderSelect.appendChild(opt);
    });

    // Populate Category options
    dom.editTaskCategorySelect.innerHTML = '';
    state.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      if (c.id === task.categoryId) opt.selected = true;
      dom.editTaskCategorySelect.appendChild(opt);
    });

    dom.editTaskPrioritySelect.value = task.priority || 'medium';
    dom.editTaskDueDateInput.value = task.dueDate || '';

    dom.taskEditModal.classList.add('open');
    dom.editTaskTitleInput.focus();
  }

  function closeTaskEditModal() {
    dom.taskEditModal.classList.remove('open');
  }

  function saveTaskEdit(e) {
    e.preventDefault();
    const taskId = dom.editTaskId.value;
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.title = dom.editTaskTitleInput.value.trim();
    task.notes = dom.editTaskNotesInput.value.trim();
    task.folderId = dom.editTaskFolderSelect.value;
    task.categoryId = dom.editTaskCategorySelect.value;
    task.priority = dom.editTaskPrioritySelect.value;
    task.dueDate = dom.editTaskDueDateInput.value;

    saveState();
    closeTaskEditModal();
    SoundFX.add();
    showToast('Task updated successfully', 'success');
    renderAll();
  }

  // ==========================================
  // 13. SPEECH-TO-TEXT (VOICE DICTATION)
  // ==========================================
  function setupVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      dom.voiceInputBtn.style.display = 'none';
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    let isListening = false;

    dom.voiceInputBtn.addEventListener('click', () => {
      if (isListening) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
        isListening = true;
        dom.voiceInputBtn.classList.add('listening');
        showToast('Listening... Speak your task now', 'info');
      } catch (err) {
        console.error('Speech recognition error', err);
      }
    });

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      dom.taskMessageInput.value = (dom.taskMessageInput.value + ' ' + transcript).trim();
      dom.taskMessageInput.focus();
      showToast(`Heard: "${transcript}"`, 'success');
    };

    recognition.onend = () => {
      isListening = false;
      dom.voiceInputBtn.classList.remove('listening');
    };

    recognition.onerror = () => {
      isListening = false;
      dom.voiceInputBtn.classList.remove('listening');
      showToast('Voice input stopped', 'warning');
    };
  }

  // ==========================================
  // 14. BACKUP, IMPORT, EXPORT
  // ==========================================
  function exportData() {
    const payload = {
      version: 2,
      exportDate: new Date().toISOString(),
      folders: state.folders,
      categories: state.categories,
      tasks: state.tasks
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasker-up-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Workspace backup downloaded!', 'success');
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.folders && parsed.categories && parsed.tasks) {
          state.folders = parsed.folders;
          state.categories = parsed.categories;
          state.tasks = parsed.tasks;
          saveState();
          dom.backupModal.classList.remove('open');
          showToast('Workspace imported successfully!', 'success');
          renderAll();
        } else {
          showToast('Invalid backup file structure', 'error');
        }
      } catch (err) {
        showToast('Error parsing JSON backup file', 'error');
      }
    };
    reader.readAsText(file);
  }

  function resetToSampleData() {
    if (confirm('Reset all tasks, folders, and categories to default sample data?')) {
      state.folders = JSON.parse(JSON.stringify(DEFAULT_FOLDERS));
      state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      state.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
      state.activeView = { type: 'all', id: null };
      saveState();
      dom.backupModal.classList.remove('open');
      showToast('Sample data reloaded!', 'info');
      renderAll();
    }
  }

  // ==========================================
  // 15. DROPDOWNS & POPOVERS MANAGEMENT
  // ==========================================
  function closeAllDropdowns() {
    dom.entryFolderDropdown.classList.remove('open');
    dom.entryCategoryDropdown.classList.remove('open');
    dom.entryPriorityDropdown.classList.remove('open');
  }

  function closeMobileSidebar() {
    dom.sidebar.classList.remove('open');
  }

  // ==========================================
  // 16. EVENT LISTENERS SETUP
  // ==========================================
  function bindEventListeners() {
    // Mobile Drawer
    dom.mobileMenuBtn.addEventListener('click', () => {
      dom.sidebar.classList.toggle('open');
    });
    dom.sidebarCloseBtn.addEventListener('click', closeMobileSidebar);

    // System views buttons
    dom.systemViewsList.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeView = { type: btn.dataset.view, id: null };
        renderAll();
        SoundFX.click();
        closeMobileSidebar();
      });
    });

    // Quick-entry input auto-resize & keyboard submit
    dom.taskMessageInput.addEventListener('input', () => {
      dom.taskMessageInput.style.height = 'auto';
      dom.taskMessageInput.style.height = Math.min(dom.taskMessageInput.scrollHeight, 120) + 'px';
    });

    dom.taskMessageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addNewTaskFromMessage(dom.taskMessageInput.value);
      }
    });

    dom.quickEntryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addNewTaskFromMessage(dom.taskMessageInput.value);
    });

    // Dropdown toggles
    dom.entryFolderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dom.entryFolderDropdown.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) dom.entryFolderDropdown.classList.add('open');
    });

    dom.entryCategoryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dom.entryCategoryDropdown.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) dom.entryCategoryDropdown.classList.add('open');
    });

    dom.entryPriorityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dom.entryPriorityDropdown.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) dom.entryPriorityDropdown.classList.add('open');
    });

    // Priority dropdown selection items
    dom.entryPriorityDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        state.entry.priority = item.dataset.priority;
        renderEntryChips();
        closeAllDropdowns();
        SoundFX.click();
      });
    });

    // Due date picker change
    dom.entryDueDateInput.addEventListener('change', () => {
      state.entry.dueDate = dom.entryDueDateInput.value;
      renderEntryChips();
    });

    // Quick New Category shortcut in meta bar
    dom.quickAddCatShortcutBtn.addEventListener('click', () => {
      openCategoryModal();
    });

    // New Folder / Category modal open buttons
    dom.openNewFolderModalBtn.addEventListener('click', () => openFolderModal());
    dom.openNewCategoryModalBtn.addEventListener('click', () => openCategoryModal());

    // Category modal events
    dom.closeCategoryModalBtn.addEventListener('click', closeCategoryModal);
    dom.cancelCategoryModalBtn.addEventListener('click', closeCategoryModal);
    dom.categoryForm.addEventListener('submit', saveCategory);

    // Folder modal events
    dom.closeFolderModalBtn.addEventListener('click', closeFolderModal);
    dom.cancelFolderModalBtn.addEventListener('click', closeFolderModal);
    dom.folderForm.addEventListener('submit', saveFolder);

    // Task edit modal events
    dom.closeTaskEditModalBtn.addEventListener('click', closeTaskEditModal);
    dom.cancelTaskEditModalBtn.addEventListener('click', closeTaskEditModal);
    dom.taskEditForm.addEventListener('submit', saveTaskEdit);
    dom.deleteTaskFromEditBtn.addEventListener('click', () => {
      const taskId = dom.editTaskId.value;
      deleteTask(taskId);
      closeTaskEditModal();
    });

    // Backup modal events
    dom.backupDataBtn.addEventListener('click', () => dom.backupModal.classList.add('open'));
    dom.closeBackupModalBtn.addEventListener('click', () => dom.backupModal.classList.remove('open'));
    dom.exportDataBtn.addEventListener('click', exportData);
    dom.importDataFileInput.addEventListener('change', (e) => importData(e.target.files[0]));
    dom.resetDemoDataBtn.addEventListener('click', resetToSampleData);

    // Search bar
    dom.taskSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderAll();
    });
    dom.clearSearchBtn.addEventListener('click', () => {
      state.searchQuery = '';
      dom.taskSearchInput.value = '';
      renderAll();
    });

    // Sort selector
    dom.taskSortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderTasks();
      SoundFX.click();
    });

    // Filter state tabs (All / Active / Completed)
    const filterStateButtons = [
      { btn: dom.viewAllStateBtn, val: 'all' },
      { btn: dom.viewActiveStateBtn, val: 'active' },
      { btn: dom.viewCompletedStateBtn, val: 'completed' }
    ];
    filterStateButtons.forEach(({ btn, val }) => {
      btn.addEventListener('click', () => {
        filterStateButtons.forEach(b => b.btn.classList.remove('active'));
        btn.classList.add('active');
        state.filterState = val;
        renderTasks();
        SoundFX.click();
      });
    });

    // Sound toggle button
    dom.soundToggleBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem(SOUND_KEY, state.soundEnabled);
      dom.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
      dom.soundToggleBtn.classList.toggle('active', state.soundEnabled);
      showToast(state.soundEnabled ? 'Audio feedback turned ON' : 'Audio muted', 'info');
      if (state.soundEnabled) SoundFX.complete();
    });
    dom.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
    dom.soundToggleBtn.classList.toggle('active', state.soundEnabled);

    // Empty state write button
    dom.emptyStateAddBtn.addEventListener('click', () => {
      dom.taskMessageInput.focus();
    });

    // Global click listener to close popovers and backdrop clicks
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.meta-dropdown-wrap')) {
        closeAllDropdowns();
      }

      // Close modals on clicking backdrop
      if (e.target.classList.contains('modal-backdrop')) {
        e.target.classList.remove('open');
      }
    });

    // Escape key closes modals and dropdowns
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllDropdowns();
        closeCategoryModal();
        closeFolderModal();
        closeTaskEditModal();
        dom.backupModal.classList.remove('open');
      }
    });

    setupVoiceInput();

    // Cloud Sync event bridges
    window.addEventListener('tasker:get-workspace', (e) => {
      e.detail.data = {
        folders: state.folders,
        categories: state.categories,
        tasks: state.tasks
      };
    });

    window.addEventListener('tasker:remote-update', (e) => {
      const { folders, categories, tasks } = e.detail;
      if (folders && Array.isArray(folders) && folders.length) {
        state.folders = folders;
      }
      if (categories && Array.isArray(categories) && categories.length) {
        state.categories = categories;
      }
      if (tasks && Array.isArray(tasks)) {
        state.tasks = tasks;
      }
      saveState(true);
      renderAll();
    });
  }

  // ==========================================
  // 17. UTILITY FUNCTIONS
  // ==========================================
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDuePretty(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) return 'Today';

    const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    if (dateStr === tmrw) return 'Tomorrow';

    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ==========================================
  // 18. APP INITIALIZATION
  // ==========================================
  function init() {
    loadInitialState();
    bindEventListeners();
    renderAll();
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
