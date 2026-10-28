/**
 * TASKER UP! — Cloud Sync & Authentication Module
 * Built with Firebase Authentication & Cloud Firestore (Compat SDK)
 * Dedicated to seamless Google Sign-In and real-time multi-device sync.
 */

(function () {
  'use strict';

  const CONFIG_STORAGE_KEY = 'tasker_up_firebase_config_v1';
  let firebaseApp = null;
  let auth = null;
  let db = null;
  let unsubscribeSnapshot = null;
  let currentUser = null;
  let isSavingToCloud = false;
  let saveDebounceTimer = null;
  let lastSyncedTimestamp = null;
  let isInitialized = false;
  let lastInitError = null;

  // ==========================================
  // 1. CONFIGURATION MANAGEMENT
  // ==========================================
  function getFirebaseConfig() {
    // 1. Pre-configured window.FIREBASE_CONFIG from firebase-config.js takes top priority
    if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.projectId) {
      return window.FIREBASE_CONFIG;
    }

    // 2. Check localStorage fallback (if customized in-browser)
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.apiKey && parsed.projectId) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading stored Firebase config', e);
    }

    return null;
  }

  function saveFirebaseConfig(configObj) {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configObj));
      return true;
    } catch (e) {
      console.error('Failed to save Firebase config', e);
      return false;
    }
  }

  function hasValidConfig() {
    const cfg = getFirebaseConfig();
    return !!(cfg && cfg.apiKey && cfg.projectId);
  }

  // ==========================================
  // 2. FIREBASE INITIALIZATION
  // ==========================================
  function initFirebase() {
    // If already successfully initialized, return true immediately
    if (isInitialized && firebaseApp && auth && db) {
      return true;
    }

    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded.');
      updateUIStatus('offline', 'Firebase SDK Unavailable');
      return false;
    }

    const config = getFirebaseConfig();
    if (!config) {
      updateUIStatus('unconfigured', 'Connect Google Cloud');
      return false;
    }

    try {
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.app();
      }

      auth = firebase.auth();
      db = firebase.firestore();

      // Enable offline persistence safely (only once, never throw)
      if (!isInitialized) {
        try {
          db.enablePersistence({ synchronizeTabs: true }).catch(() => {
            // Multi-tab or browser constraint ignored
          });
        } catch (persistenceErr) {
          // If persistence has already been started or is unsupported, silently continue
          console.debug('Firestore persistence note:', persistenceErr.message);
        }

        // Listen for Google Auth state changes
        auth.onAuthStateChanged(handleAuthStateChange);
      }

      isInitialized = true;
      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      lastInitError = err;
      updateUIStatus('error', 'Cloud Config Error');
      return false;
    }
  }

  // ==========================================
  // 3. AUTH STATE & FIRESTORE REAL-TIME SYNC
  // ==========================================
  function handleAuthStateChange(user) {
    currentUser = user;
    if (user) {
      updateUIUserLoggedIn(user);
      startFirestoreSync(user);
      startSharedProjectsDiscovery(user);
      showToast(`👋 Welcome, ${user.displayName || user.email}!`, 'success');
    } else {
      stopFirestoreSync();
      updateUIUserLoggedOut();
    }
  }

  function startFirestoreSync(user) {
    if (!db || !user) return;

    updateUIStatus('syncing', 'Connecting to Cloud...');

    const docRef = db.collection('users').doc(user.uid).collection('workspace').doc('main');

    // Real-time listener for incoming changes from any other device
    unsubscribeSnapshot = docRef.onSnapshot(
      (doc) => {
        if (isSavingToCloud) return; // Prevent local loop

        if (doc.exists) {
          const cloudData = doc.data();
          if (cloudData && (cloudData.tasks || cloudData.folders || cloudData.categories)) {
            lastSyncedTimestamp = cloudData.updatedAt ? cloudData.updatedAt.toMillis() : Date.now();
            updateUIStatus('synced', 'Synced with Google Cloud');

            // Dispatch event to app.js
            window.dispatchEvent(
              new CustomEvent('tasker:remote-update', {
                detail: {
                  tasks: cloudData.tasks || [],
                  folders: cloudData.folders || [],
                  categories: cloudData.categories || [],
                  lastSynced: lastSyncedTimestamp
                }
              })
            );
          }
        } else {
          // New account or first-time sync: upload current local tasks to Google Cloud
          uploadCurrentWorkspaceToCloud(true);
        }
      },
      (error) => {
        console.error('Firestore listener error:', error);
        updateUIStatus('error', 'Sync Error');
        const errMsg = (error && error.message) ? error.message : '';
        const isPermissionDenied = (error && error.code === 'permission-denied') || 
                                   (error && error.code === 'firestore/permission-denied') || 
                                   errMsg.toLowerCase().includes('permission');
        const isNotFound = (error && error.code === 'not-found') || errMsg.includes('not exist');

        if (isNotFound) {
          showToast('Firestore database not created yet. Go to Firebase Console > Firestore Database and click "Create database".', 'error');
        } else if (isPermissionDenied) {
          showToast('🔒 Firestore Rules: In Firebase Console > Firestore Database > Rules, set "allow read, write: if request.auth != null;" and click Publish.', 'error');
        } else {
          showToast('Sync error: ' + (errMsg || error.code || 'Unknown'), 'error');
        }
      }
    );
  }

  function stopFirestoreSync() {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
    if (unsubscribeSharedProjects) {
      unsubscribeSharedProjects();
      unsubscribeSharedProjects = null;
    }
  }

  /**
   * Upload local tasks to Google Cloud Firestore
   */
  /**
   * Deeply sanitizes an object or array for Cloud Firestore,
   * completely removing all keys with `undefined` values and converting standalone undefined to null,
   * while safely preserving Firestore FieldValue instances.
   */
  function sanitizeForFirestore(val) {
    if (val === undefined) return null;
    if (val === null) return null;
    if (typeof val === 'function' || typeof val === 'symbol') return null;
    // Preserve Firestore FieldValue instances (e.g. serverTimestamp, arrayUnion, delete)
    if (typeof val === 'object' && val !== null) {
      if (typeof val.isEqual === 'function' || val._methodName || (val.constructor && val.constructor.name === 'FieldValue')) {
        return val;
      }
    }
    if (Array.isArray(val)) {
      return val
        .filter(item => item !== undefined)
        .map(item => sanitizeForFirestore(item));
    }
    if (typeof val === 'object') {
      const clean = {};
      for (const key of Object.keys(val)) {
        const v = val[key];
        if (v !== undefined) {
          clean[key] = sanitizeForFirestore(v);
        }
      }
      return clean;
    }
    return val;
  }

  async function uploadCurrentWorkspaceToCloud(isInitial = false) {
    if (!db || !currentUser) return;

    try {
      updateUIStatus('syncing', 'Syncing to Cloud...');
      isSavingToCloud = true;

      const payloadEvent = new CustomEvent('tasker:get-workspace', { detail: {} });
      window.dispatchEvent(payloadEvent);
      const payload = payloadEvent.detail.data;

      if (!payload) {
        isSavingToCloud = false;
        return;
      }

      const docRef = db.collection('users').doc(currentUser.uid).collection('workspace').doc('main');

      const rawTasks = payload.tasks || [];
      const rawFolders = payload.folders || [];
      const rawCategories = payload.categories || [];

      const docData = sanitizeForFirestore({
        tasks: rawTasks,
        folders: rawFolders,
        categories: rawCategories,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deviceInfo: (navigator && navigator.userAgent) ? navigator.userAgent : 'web'
      });

      await docRef.set(docData, { merge: true });

      lastSyncedTimestamp = Date.now();
      updateUIStatus('synced', 'Synced just now');
      if (isInitial) {
        showToast('☁️ Initialized your cloud workspace!', 'success');
      }
    } catch (err) {
      console.error('Cloud save failed:', err);
      updateUIStatus('error', 'Sync Failed');
      const errMsg = (err && err.message) ? err.message : '';
      const isPermissionDenied = (err && err.code === 'permission-denied') || 
                                 (err && err.code === 'firestore/permission-denied') || 
                                 errMsg.toLowerCase().includes('permission');
      const isNotFound = (err && err.code === 'not-found') || errMsg.includes('not exist');

      if (isNotFound) {
        showToast('Firestore database not created yet. Please click "Create database" in Firebase Console > Firestore Database.', 'error');
      } else if (isPermissionDenied) {
        showToast('🔒 Firestore Rules: In Firebase Console > Firestore Database > Rules, set "allow read, write: if request.auth != null;" and click Publish.', 'error');
      } else {
        showToast('Could not save to cloud: ' + (errMsg || err.code || 'Unknown'), 'error');
      }
    } finally {
      setTimeout(() => {
        isSavingToCloud = false;
      }, 600);
    }
  }

  function queueCloudSave(payload, immediate = false) {
    if (!currentUser || !db) return;

    updateUIStatus('syncing', 'Syncing...');
    clearTimeout(saveDebounceTimer);
    if (immediate) {
      uploadCurrentWorkspaceToCloud(false);
    } else {
      saveDebounceTimer = setTimeout(() => {
        uploadCurrentWorkspaceToCloud(false);
      }, 700);
    }
  }

  window.addEventListener('beforeunload', () => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      uploadCurrentWorkspaceToCloud(false);
    }
  });

  // ==========================================
  // 4. GOOGLE SIGN-IN ACTION
  // ==========================================
  async function signInWithGoogle() {
    // Google OAuth requires http: or https: domain (not local file:///)
    if (window.location.protocol === 'file:') {
      showToast('⚠️ Google Sign-In requires your live website (https://keanunm.github.io/tasker-up/) or http://localhost, not a local file path (file://).', 'error');
      setTimeout(() => {
        if (confirm('Google Sign-In requires an active web server or your live site. Would you like to open your live site now?')) {
          window.open('https://keanunm.github.io/tasker-up/', '_blank');
        }
      }, 350);
      return;
    }

    if (!initFirebase()) {
      showToast('Firebase setup: ' + (lastInitError ? lastInitError.message : 'Please check your Firebase configuration in js/firebase-config.js.'), 'error');
      return;
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(provider);
      closeAuthModal();
    } catch (err) {
      console.error('Google Sign-in failed', err);
      if (err.code === 'auth/popup-blocked') {
        showToast('Sign-in popup was blocked by your browser. Please allow popups.', 'error');
      } else if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // User closed the window
      } else if (err.code === 'auth/unauthorized-domain') {
        showToast(`Domain "${window.location.hostname}" is not authorized yet. Add it to Firebase Console > Authentication > Settings > Authorized Domains.`, 'error');
      } else if (err.code === 'auth/operation-not-allowed') {
        showToast('Google Sign-In is not enabled yet. In Firebase Console, go to Authentication > Sign-in method and enable Google.', 'error');
      } else if (err.code === 'auth/configuration-not-found' || err.code === 'auth/invalid-api-key') {
        showToast('Invalid Firebase configuration. Please check your project settings.', 'error');
      } else {
        showToast('Google Sign-in: ' + err.message, 'error');
      }
    }
  }

  async function signOut() {
    if (!auth) return;
    try {
      await auth.signOut();
      showToast('Signed out from Google', 'info');
      closeAccountMenu();
    } catch (err) {
      showToast('Sign-out error: ' + err.message, 'error');
    }
  }

  // ==========================================
  // 5. UI CONTROLS & EVENT BINDINGS
  // ==========================================
  function updateUIStatus(status, label) {
    const pill = document.getElementById('cloudSyncBtn');
    const badge = document.getElementById('cloudStatusBadge');
    const mobileBtn = document.getElementById('mobileCloudBtn');
    const statusText = document.getElementById('cloudAccountStatusText');

    if (badge) {
      badge.className = 'cloud-status-badge ' + status;
      badge.textContent = status === 'synced' ? 'Synced' : (status === 'syncing' ? 'Syncing...' : (status === 'unconfigured' ? 'Setup' : 'Offline'));
    }

    if (statusText) {
      statusText.textContent = label || status;
    }

    if (pill) {
      pill.setAttribute('data-status', status);
      pill.title = label || status;
    }

    if (mobileBtn) {
      mobileBtn.setAttribute('data-status', status);
    }
  }

  function updateUIUserLoggedIn(user) {
    const btn = document.getElementById('cloudSyncBtn');
    const userAvatar = document.getElementById('cloudUserAvatar');
    const userName = document.getElementById('cloudUserName');
    const menuAvatar = document.getElementById('menuUserAvatar');
    const menuName = document.getElementById('menuUserName');
    const menuEmail = document.getElementById('menuUserEmail');

    const name = user.displayName || user.email.split('@')[0];
    const initial = name.charAt(0).toUpperCase();

    if (btn) btn.classList.add('logged-in');

    if (userAvatar) {
      if (user.photoURL) {
        userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${name}" referrerpolicy="no-referrer">`;
      } else {
        userAvatar.textContent = initial;
      }
    }

    if (userName) userName.textContent = name;

    if (menuAvatar) {
      if (user.photoURL) {
        menuAvatar.innerHTML = `<img src="${user.photoURL}" alt="${name}" referrerpolicy="no-referrer">`;
      } else {
        menuAvatar.textContent = initial;
      }
    }

    if (menuName) menuName.textContent = name;
    if (menuEmail) menuEmail.textContent = user.email;
  }

  function updateUIUserLoggedOut() {
    const btn = document.getElementById('cloudSyncBtn');
    const userAvatar = document.getElementById('cloudUserAvatar');
    const userName = document.getElementById('cloudUserName');

    if (btn) btn.classList.remove('logged-in');

    if (userAvatar) {
      userAvatar.innerHTML = '<span class="cloud-icon">☁️</span>';
    }

    if (userName) {
      userName.textContent = 'Cloud Sync';
    }

    updateUIStatus(hasValidConfig() ? 'offline' : 'unconfigured', hasValidConfig() ? 'Local Only' : 'Connect Google Cloud');
  }

  function openAuthModal() {
    const modal = document.getElementById('cloudAuthModal');
    if (!modal) return;
    modal.classList.add('open');

    // If already configured, keep drawer collapsed; if not, open drawer
    const drawer = document.getElementById('firebaseConfigDrawer');
    if (drawer) {
      if (!hasValidConfig()) {
        drawer.classList.remove('hidden');
      } else {
        drawer.classList.add('hidden');
      }
    }
  }

  function closeAuthModal() {
    const modal = document.getElementById('cloudAuthModal');
    if (modal) modal.classList.remove('open');
  }

  function toggleAccountMenu() {
    const menu = document.getElementById('cloudAccountMenu');
    if (!menu) return;
    menu.classList.toggle('active');
  }

  function closeAccountMenu() {
    const menu = document.getElementById('cloudAccountMenu');
    if (menu) menu.classList.remove('active');
  }

  function showConfigDrawer() {
    const drawer = document.getElementById('firebaseConfigDrawer');
    if (drawer) {
      drawer.classList.remove('hidden');
      const textarea = document.getElementById('firebaseJsonPasteInput');
      if (textarea) textarea.focus();
    }
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 20);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ==========================================
  // 6. INITIALIZATION & DOM BINDING
  // ==========================================
  function initDOM() {
    // Cloud sync main button in top-bar
    const cloudSyncBtn = document.getElementById('cloudSyncBtn');
    if (cloudSyncBtn) {
      cloudSyncBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentUser) {
          toggleAccountMenu();
        } else {
          openAuthModal();
        }
      });
    }

    // Mobile cloud button
    const mobileCloudBtn = document.getElementById('mobileCloudBtn');
    if (mobileCloudBtn) {
      mobileCloudBtn.addEventListener('click', () => {
        if (currentUser) {
          toggleAccountMenu();
        } else {
          openAuthModal();
        }
      });
    }

    // Close account menu on outside click
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('cloudAccountMenu');
      const btn = document.getElementById('cloudSyncBtn');
      if (menu && menu.classList.contains('active')) {
        if (!menu.contains(e.target) && !btn.contains(e.target)) {
          closeAccountMenu();
        }
      }
    });

    // Close Auth modal
    const closeBtn = document.getElementById('closeCloudAuthModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);

    const modalBackdrop = document.getElementById('cloudAuthModal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeAuthModal();
      });
    }

    // Google Sign-In button
    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', signInWithGoogle);
    }

    // Toggle project settings drawer
    const toggleConfigBtn = document.getElementById('toggleFirebaseConfigBtn');
    if (toggleConfigBtn) {
      toggleConfigBtn.addEventListener('click', () => {
        const drawer = document.getElementById('firebaseConfigDrawer');
        if (drawer) drawer.classList.toggle('hidden');
      });
    }

    // Quick save config from paste snippet
    const saveQuickConfigBtn = document.getElementById('saveQuickConfigBtn');
    if (saveQuickConfigBtn) {
      saveQuickConfigBtn.addEventListener('click', () => {
        const text = document.getElementById('firebaseJsonPasteInput').value.trim();
        if (!text) {
          showToast('Please paste your Firebase configuration snippet', 'error');
          return;
        }

        try {
          let cfg = {};
          if (text.startsWith('{')) {
            cfg = JSON.parse(text);
          } else {
            const extract = (key) => {
              const match = text.match(new RegExp(`${key}["']?\\s*:\\s*["']([^"']+)["']`));
              return match ? match[1] : '';
            };
            cfg = {
              apiKey: extract('apiKey'),
              authDomain: extract('authDomain'),
              projectId: extract('projectId'),
              storageBucket: extract('storageBucket'),
              messagingSenderId: extract('messagingSenderId'),
              appId: extract('appId')
            };
          }

          if (cfg.apiKey && cfg.projectId) {
            saveFirebaseConfig(cfg);
            showToast('✅ Cloud project connected successfully!', 'success');
            const drawer = document.getElementById('firebaseConfigDrawer');
            if (drawer) drawer.classList.add('hidden');

            if (initFirebase()) {
              signInWithGoogle();
            }
          } else {
            showToast('Could not extract apiKey or projectId. Please check the snippet.', 'error');
          }
        } catch (err) {
          showToast('Invalid format: ' + err.message, 'error');
        }
      });
    }

    // Account menu items
    const menuSyncNowBtn = document.getElementById('menuSyncNowBtn');
    if (menuSyncNowBtn) {
      menuSyncNowBtn.addEventListener('click', () => {
        uploadCurrentWorkspaceToCloud(false);
        closeAccountMenu();
      });
    }

    const menuSignOutBtn = document.getElementById('menuSignOutBtn');
    if (menuSignOutBtn) {
      menuSignOutBtn.addEventListener('click', signOut);
    }

    const menuConfigBtn = document.getElementById('menuConfigBtn');
    if (menuConfigBtn) {
      menuConfigBtn.addEventListener('click', () => {
        closeAccountMenu();
        openAuthModal();
        showConfigDrawer();
      });
    }

    // Startup check
    initFirebase();
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDOM);
  } else {
    initDOM();
  }

  // ==========================================
  // 6. COLLABORATIVE SHARED PROJECT SYNC
  // ==========================================
  const activeCollabListeners = {};

  async function syncCollaborativeProject(folder, tasks, categories) {
    if (!db || !folder || !folder.id) return;
    try {
      const docRef = db.collection('shared_projects').doc(folder.id);
      const safeTasks = (tasks || []).map(t => ({
        id: t.id,
        title: t.title,
        notes: t.notes || '',
        folderId: folder.id,
        categoryId: t.categoryId || null,
        priority: t.priority || 'normal',
        dueDate: t.dueDate || null,
        completed: !!t.completed,
        completedAt: t.completedAt || null,
        completedBy: t.completedBy || null,
        memberCompleted: !!t.memberCompleted,
        starred: !!t.starred,
        createdAt: t.createdAt || Date.now()
      }));

      const safeCats = (categories || []).map(c => ({
        id: c.id,
        name: c.name,
        color: c.color || '#06b6d4',
        icon: c.icon || '🏷️',
        folderId: folder.id
      }));

      // Build lowercase member emails list for query discovery
      const memberEmails = (folder.members || [])
        .map(m => m.email ? m.email.trim().toLowerCase() : '')
        .filter(Boolean);
      if (folder.hostEmail && !memberEmails.includes(folder.hostEmail.toLowerCase())) {
        memberEmails.push(folder.hostEmail.toLowerCase());
      }
      if (currentUser && currentUser.email && !memberEmails.includes(currentUser.email.toLowerCase())) {
        memberEmails.push(currentUser.email.toLowerCase());
      }

      const cleanFolder = sanitizeForFirestore({
        id: folder.id,
        name: folder.name || 'Shared Project',
        desc: folder.desc || '',
        icon: folder.icon || '📁',
        color: folder.color || '#06b6d4',
        hostEmail: folder.hostEmail || (currentUser ? currentUser.email : 'host@taskerup.io'),
        isCollaborative: true,
        members: folder.members || [],
        kickedEmails: folder.kickedEmails || [],
        updatedAt: Date.now()
      });

      const cleanMemberEmails = sanitizeForFirestore(memberEmails);
      const cleanKickedEmails = sanitizeForFirestore((folder.kickedEmails || []).map(e => (e || '').toLowerCase().trim()));
      const cleanTasks = sanitizeForFirestore(safeTasks);
      const cleanCats = sanitizeForFirestore(safeCats);

      const projectData = sanitizeForFirestore({
        folder: cleanFolder,
        memberEmails: cleanMemberEmails,
        kickedEmails: cleanKickedEmails,
        tasks: cleanTasks,
        categories: cleanCats,
        updatedAt: Date.now(),
        updatedBy: currentUser ? (currentUser.displayName || currentUser.email || 'user') : 'user'
      });

      await docRef.set(projectData, { merge: true });
    } catch (err) {
      console.warn('syncCollaborativeProject failed', err);
    }
  }

  let unsubscribeSharedProjects = null;

  function startSharedProjectsDiscovery(user) {
    if (!db || !user || !user.email) return;
    if (unsubscribeSharedProjects) {
      unsubscribeSharedProjects();
      unsubscribeSharedProjects = null;
    }

    const email = user.email.toLowerCase().trim();

    try {
      unsubscribeSharedProjects = db.collection('shared_projects')
        .where('memberEmails', 'array-contains', email)
        .onSnapshot((snapshot) => {
          if (!snapshot) return;
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
              const data = change.doc.data();
              if (data && data.folder) {
                // If marked deleted or closed, dispatch removed event immediately
                const isDocDead = data.isDeleted || (data.folder && data.folder.isDeleted) || data.isClosed || (data.folder && data.folder.isClosed) || data.isCollaborative === false || (data.folder && data.folder.isCollaborative === false);
                if (isDocDead) {
                  window.dispatchEvent(
                    new CustomEvent('tasker:shared-project-removed', {
                      detail: {
                        folderId: change.doc.id
                      }
                    })
                  );
                  return;
                }

                window.dispatchEvent(
                  new CustomEvent('tasker:shared-project-update', {
                    detail: {
                      folderId: change.doc.id,
                      data: data
                    }
                  })
                );
              }
            } else if (change.type === 'removed') {
              window.dispatchEvent(
                new CustomEvent('tasker:shared-project-removed', {
                  detail: {
                    folderId: change.doc.id
                  }
                })
              );
            }
          });
        }, (err) => {
          console.debug('Shared projects discovery note:', err.message);
        });
    } catch (err) {
      console.warn('startSharedProjectsDiscovery error', err);
    }
  }

  function stopListeningToCollaborativeProject(folderId) {
    if (!folderId || !activeCollabListeners[folderId]) return;
    try {
      activeCollabListeners[folderId]();
    } catch (e) {}
    delete activeCollabListeners[folderId];
  }

  function listenToCollaborativeProject(folderId, callback) {
    if (!db || !folderId) return null;
    if (activeCollabListeners[folderId]) {
      return activeCollabListeners[folderId];
    }
    try {
      const unsub = db.collection('shared_projects').doc(folderId).onSnapshot((doc) => {
        if (doc && doc.exists) {
          callback(doc.data());
        } else {
          // Document deleted from Firestore: kick all listening members
          callback({
            isDeleted: true,
            isCollaborative: false,
            folder: { id: folderId, isDeleted: true, isCollaborative: false }
          });
        }
      }, (err) => {
        console.warn('Collaborative project snapshot error for', folderId, err);
      });
      activeCollabListeners[folderId] = unsub;
      return unsub;
    } catch (err) {
      console.warn('listenToCollaborativeProject setup error', err);
      return null;
    }
  }

  async function unshareCollaborativeProject(folderId, folderName) {
    if (!db || !folderId) return;
    try {
      if (activeCollabListeners[folderId]) {
        try { activeCollabListeners[folderId](); } catch (e) {}
        delete activeCollabListeners[folderId];
      }
      const docRef = db.collection('shared_projects').doc(folderId);
      await docRef.set({
        isCollaborative: false,
        isClosed: true,
        isDeleted: true,
        memberEmails: [],
        folder: {
          id: folderId,
          name: folderName || 'Shared Project',
          isCollaborative: false,
          isClosed: true,
          isDeleted: true,
          members: []
        },
        updatedAt: Date.now()
      }, { merge: true });

      try {
        await docRef.delete();
      } catch (e) {}
    } catch (err) {
      console.warn('unshareCollaborativeProject failed', err);
    }
  }

  async function deleteCollaborativeProject(folderId, folderName) {
    if (!db || !folderId) return;
    try {
      if (activeCollabListeners[folderId]) {
        try { activeCollabListeners[folderId](); } catch (e) {}
        delete activeCollabListeners[folderId];
      }
      const docRef = db.collection('shared_projects').doc(folderId);
      await docRef.set({
        isCollaborative: false,
        isDeleted: true,
        isClosed: true,
        memberEmails: [],
        folder: {
          id: folderId,
          name: folderName || 'Shared Project',
          isCollaborative: false,
          isDeleted: true,
          isClosed: true,
          members: []
        },
        updatedAt: Date.now()
      }, { merge: true });

      try {
        await docRef.delete();
      } catch (e) {}
    } catch (err) {
      console.warn('deleteCollaborativeProject failed', err);
    }
  }

  /**
   * Atomically appends a chat message to a collaborative project using Firestore's arrayUnion.
   * Eliminates chat message overwrite race conditions between simultaneous senders.
   */
  async function sendProjectChatMessage(folderId, message) {
    if (!db || !folderId || !message) return;
    const cleanMsg = sanitizeForFirestore(message);
    const docRef = db.collection('shared_projects').doc(folderId);
    try {
      await docRef.update({
        'folder.chat': firebase.firestore.FieldValue.arrayUnion(cleanMsg),
        updatedAt: Date.now()
      });
    } catch (err) {
      try {
        await docRef.set({
          folder: {
            chat: firebase.firestore.FieldValue.arrayUnion(cleanMsg)
          },
          updatedAt: Date.now()
        }, { merge: true });
      } catch (fallbackErr) {
        console.error('sendProjectChatMessage failed', fallbackErr);
      }
    }
  }

  /**
   * Resets the project chat array (e.g. when starting a New Chat session).
   */
  async function resetProjectChat(folderId, initialMsg) {
    if (!db || !folderId) return;
    try {
      const docRef = db.collection('shared_projects').doc(folderId);
      const chatArray = initialMsg ? [sanitizeForFirestore(initialMsg)] : [];
      await docRef.set({
        folder: {
          chat: chatArray
        },
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error('resetProjectChat failed', err);
    }
  }

  /**
   * Sets or clears typing indicator status for a member in a collaborative project.
   */
  async function setTypingStatus(folderId, user, isTyping) {
    if (!db || !folderId || !user || !user.email) return;
    const safeKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const docRef = db.collection('shared_projects').doc(folderId);
    try {
      if (isTyping) {
        await docRef.update({
          [`typing.${safeKey}`]: {
            name: user.name || user.email.split('@')[0],
            email: user.email.toLowerCase(),
            timestamp: Date.now()
          }
        });
      } else {
        await docRef.update({
          [`typing.${safeKey}`]: firebase.firestore.FieldValue.delete()
        });
      }
    } catch (err) {
      if (isTyping) {
        try {
          await docRef.set({
            typing: {
              [safeKey]: {
                name: user.name || user.email.split('@')[0],
                email: user.email.toLowerCase(),
                timestamp: Date.now()
              }
            }
          }, { merge: true });
        } catch (e) {}
      }
    }
  }

  // ==========================================
  // EXPORT
  // ==========================================
  window.CloudSync = {
    initFirebase,
    isUserLoggedIn: () => !!currentUser,
    getCurrentUser: () => currentUser,
    queueCloudSave,
    uploadCurrentWorkspaceToCloud,
    openAuthModal,
    signOut,
    syncCollaborativeProject,
    unshareCollaborativeProject,
    deleteCollaborativeProject,
    listenToCollaborativeProject,
    sendProjectChatMessage,
    resetProjectChat,
    setTypingStatus
  };
})();
