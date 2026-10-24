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

  // ==========================================
  // 1. CONFIGURATION MANAGEMENT
  // ==========================================
  function getFirebaseConfig() {
    // 1. Check localStorage first (saved via UI)
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

    // 2. Fallback to window.FIREBASE_CONFIG from firebase-config.js
    if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.projectId) {
      return window.FIREBASE_CONFIG;
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

      // Enable offline persistence
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {
        // Multi-tab or browser constraint ignored
      });

      // Listen for Google Auth state changes
      auth.onAuthStateChanged(handleAuthStateChange);
      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
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
        showToast('Sync error: ' + error.message, 'error');
      }
    );
  }

  function stopFirestoreSync() {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
  }

  /**
   * Upload local tasks to Google Cloud Firestore
   */
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

      await docRef.set({
        tasks: payload.tasks || [],
        folders: payload.folders || [],
        categories: payload.categories || [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deviceInfo: navigator.userAgent
      }, { merge: true });

      lastSyncedTimestamp = Date.now();
      updateUIStatus('synced', 'Synced just now');
      if (isInitial) {
        showToast('☁️ Initialized your cloud workspace!', 'success');
      }
    } catch (err) {
      console.error('Cloud save failed:', err);
      updateUIStatus('error', 'Sync Failed');
      showToast('Could not save to cloud: ' + err.message, 'error');
    } finally {
      setTimeout(() => {
        isSavingToCloud = false;
      }, 600);
    }
  }

  function queueCloudSave(payload) {
    if (!currentUser || !db) return;

    updateUIStatus('syncing', 'Syncing...');
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      uploadCurrentWorkspaceToCloud(false);
    }, 700);
  }

  // ==========================================
  // 4. GOOGLE SIGN-IN ACTION
  // ==========================================
  async function signInWithGoogle() {
    if (!initFirebase()) {
      showConfigDrawer();
      showToast('Please connect your cloud project once to enable Google Sign-In', 'info');
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
      } else if (err.code === 'auth/configuration-not-found' || err.code === 'auth/invalid-api-key') {
        showConfigDrawer();
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
  // EXPORT
  // ==========================================
  window.CloudSync = {
    initFirebase,
    isUserLoggedIn: () => !!currentUser,
    getCurrentUser: () => currentUser,
    queueCloudSave,
    uploadCurrentWorkspaceToCloud,
    openAuthModal,
    signOut
  };
})();
