/**
 * TASKER UP! — Cloud Sync & Authentication Module
 * Built with Firebase Authentication & Cloud Firestore (Compat SDK)
 * Supports Google Sign-In, Email/Password, Real-time multi-device sync, and Offline caching.
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
    // Check localStorage first (user-entered via UI)
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

    // Fallback to window.FIREBASE_CONFIG from firebase-config.js
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
      console.warn('Firebase SDK not loaded on page.');
      updateUIStatus('offline', 'Firebase SDK Unavailable');
      return false;
    }

    const config = getFirebaseConfig();
    if (!config) {
      updateUIStatus('unconfigured', 'Cloud Sync (Setup Required)');
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

      // Enable offline persistence if available
      db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        if (err.code === 'failed-precondition') {
          // Multiple tabs open, persistence can only be enabled in one tab at a time.
        } else if (err.code === 'unimplemented') {
          // The current browser does not support all features required to enable persistence
        }
      });

      // Listen for auth state changes
      auth.onAuthStateChanged(handleAuthStateChange);
      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      updateUIStatus('error', 'Firebase Config Error');
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
      showToast(`👋 Welcome back, ${user.displayName || user.email}!`, 'success');
    } else {
      stopFirestoreSync();
      updateUIUserLoggedOut();
    }
  }

  function startFirestoreSync(user) {
    if (!db || !user) return;

    updateUIStatus('syncing', 'Connecting to Cloud...');

    const docRef = db.collection('users').doc(user.uid).collection('workspace').doc('main');

    // Real-time listener for incoming changes from other devices
    unsubscribeSnapshot = docRef.onSnapshot(
      (doc) => {
        if (isSavingToCloud) return; // Ignore our own write echo

        if (doc.exists) {
          const cloudData = doc.data();
          if (cloudData && (cloudData.tasks || cloudData.folders || cloudData.categories)) {
            lastSyncedTimestamp = cloudData.updatedAt ? cloudData.updatedAt.toMillis() : Date.now();
            updateUIStatus('synced', 'Synced with Cloud');
            
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
          // New user without cloud data: initial push of existing local tasks to cloud
          uploadCurrentWorkspaceToCloud(true);
        }
      },
      (error) => {
        console.error('Firestore snapshot listener error:', error);
        updateUIStatus('error', 'Cloud Sync Error');
        showToast('Cloud sync error: ' + error.message, 'error');
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
   * Uploads the local workspace to Firestore
   */
  async function uploadCurrentWorkspaceToCloud(isInitial = false) {
    if (!db || !currentUser) return;

    try {
      updateUIStatus('syncing', 'Syncing to Cloud...');
      isSavingToCloud = true;

      // Request latest payload from app.js
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
  // 4. AUTHENTICATION ACTIONS
  // ==========================================
  async function signInWithGoogle() {
    if (!initFirebase()) {
      openConfigTab();
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
        showToast('Sign-in popup was blocked. Please allow popups.', 'error');
      } else if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // User closed the window
      } else {
        showToast('Google Sign-in failed: ' + err.message, 'error');
      }
    }
  }

  async function signInWithEmail(email, password) {
    if (!initFirebase()) {
      openConfigTab();
      return;
    }

    try {
      await auth.signInWithEmailAndPassword(email, password);
      closeAuthModal();
    } catch (err) {
      console.error('Email sign-in failed', err);
      showToast(err.message, 'error');
      throw err;
    }
  }

  async function signUpWithEmail(email, password, displayName) {
    if (!initFirebase()) {
      openConfigTab();
      return;
    }

    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      if (displayName && cred.user) {
        await cred.user.updateProfile({ displayName: displayName });
      }
      closeAuthModal();
      showToast('Account created successfully!', 'success');
    } catch (err) {
      console.error('Sign-up failed', err);
      showToast(err.message, 'error');
      throw err;
    }
  }

  async function resetPassword(email) {
    if (!initFirebase()) return;
    try {
      await auth.sendPasswordResetEmail(email);
      showToast('Password reset link sent to ' + email, 'success');
    } catch (err) {
      showToast('Reset failed: ' + err.message, 'error');
    }
  }

  async function signOut() {
    if (!auth) return;
    try {
      await auth.signOut();
      showToast('Signed out from cloud', 'info');
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

    if (btn) {
      btn.classList.add('logged-in');
    }

    if (userAvatar) {
      if (user.photoURL) {
        userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${name}" referrerpolicy="no-referrer">`;
      } else {
        userAvatar.textContent = initial;
      }
    }

    if (userName) {
      userName.textContent = name;
    }

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

    if (btn) {
      btn.classList.remove('logged-in');
    }

    if (userAvatar) {
      userAvatar.innerHTML = '<span class="cloud-icon">☁️</span>';
    }

    if (userName) {
      userName.textContent = 'Cloud Sync';
    }

    updateUIStatus(hasValidConfig() ? 'offline' : 'unconfigured', hasValidConfig() ? 'Local Only' : 'Setup Cloud Sync');
  }

  function openAuthModal() {
    const modal = document.getElementById('cloudAuthModal');
    if (!modal) return;
    modal.classList.add('open');

    // Populate config fields if any
    const cfg = getFirebaseConfig() || {};
    const apiKeyInput = document.getElementById('fbCfgApiKey');
    const projectIdInput = document.getElementById('fbCfgProjectId');
    const authDomainInput = document.getElementById('fbCfgAuthDomain');
    const appIdInput = document.getElementById('fbCfgAppId');

    if (apiKeyInput) apiKeyInput.value = cfg.apiKey || '';
    if (projectIdInput) projectIdInput.value = cfg.projectId || '';
    if (authDomainInput) authDomainInput.value = cfg.authDomain || '';
    if (appIdInput) appIdInput.value = cfg.appId || '';

    // If unconfigured, open directly to the setup/config tab
    if (!hasValidConfig()) {
      switchAuthTab('config');
    } else {
      switchAuthTab('signin');
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

  function switchAuthTab(tabId) {
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.auth-tab-panel').forEach(panel => {
      const isActive = panel.id === `tabPanel-${tabId}`;
      panel.classList.toggle('active', isActive);
      if (isActive) {
        const firstInput = panel.querySelector('input:not([type="hidden"])');
        if (firstInput) {
          setTimeout(() => firstInput.focus(), 80);
        }
      }
    });
  }

  function openConfigTab() {
    openAuthModal();
    switchAuthTab('config');
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

    // Tab switcher buttons
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchAuthTab(btn.getAttribute('data-tab'));
      });
    });

    // Password visibility toggle buttons
    document.querySelectorAll('.password-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        const eyeOpen = btn.querySelector('.eye-open');
        const eyeClosed = btn.querySelector('.eye-closed');
        if (eyeOpen && eyeClosed) {
          eyeOpen.classList.toggle('hidden', isPassword);
          eyeClosed.classList.toggle('hidden', !isPassword);
        }
      });
    });

    // Google Sign-In button
    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', signInWithGoogle);
    }

    // Email Sign-In form
    const signInForm = document.getElementById('emailSignInForm');
    if (signInForm) {
      signInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signInEmail').value.trim();
        const pass = document.getElementById('signInPassword').value;
        const submitBtn = document.getElementById('signInSubmitBtn');
        if (!email || !pass) return;

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing in...';
          await signInWithEmail(email, pass);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      });
    }

    // Email Sign-Up form
    const signUpForm = document.getElementById('emailSignUpForm');
    if (signUpForm) {
      signUpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signUpName').value.trim();
        const email = document.getElementById('signUpEmail').value.trim();
        const pass = document.getElementById('signUpPassword').value;
        const submitBtn = document.getElementById('signUpSubmitBtn');
        if (!email || !pass) return;

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating account...';
          await signUpWithEmail(email, pass, name);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
        }
      });
    }

    // Password reset trigger
    const forgotPassLink = document.getElementById('forgotPasswordLink');
    if (forgotPassLink) {
      forgotPassLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = prompt('Enter your account email to receive a password reset link:');
        if (email && email.includes('@')) {
          resetPassword(email.trim());
        }
      });
    }

    // Firebase Config Form / JSON Paste
    const configForm = document.getElementById('firebaseConfigForm');
    if (configForm) {
      configForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const apiKey = document.getElementById('fbCfgApiKey').value.trim();
        const projectId = document.getElementById('fbCfgProjectId').value.trim();
        const authDomain = document.getElementById('fbCfgAuthDomain').value.trim() || `${projectId}.firebaseapp.com`;
        const appId = document.getElementById('fbCfgAppId').value.trim();
        const storageBucket = `${projectId}.appspot.com`;

        if (!apiKey || !projectId) {
          showToast('API Key and Project ID are required!', 'error');
          return;
        }

        const configObj = {
          apiKey,
          authDomain,
          projectId,
          storageBucket,
          appId
        };

        saveFirebaseConfig(configObj);
        showToast('⚙️ Firebase configuration saved!', 'success');

        // Re-initialize Firebase with new config
        if (initFirebase()) {
          switchAuthTab('signin');
        }
      });
    }

    // JSON Quick Paste parser
    const jsonPasteBtn = document.getElementById('parseFirebaseJsonBtn');
    if (jsonPasteBtn) {
      jsonPasteBtn.addEventListener('click', () => {
        const jsonText = document.getElementById('firebaseJsonPasteInput').value.trim();
        if (!jsonText) return;

        try {
          // Extract config fields from raw text or JSON
          let cfg = {};
          if (jsonText.startsWith('{')) {
            cfg = JSON.parse(jsonText);
          } else {
            // Regex match standard firebaseConfig JS snippet
            const extract = (key) => {
              const match = jsonText.match(new RegExp(`${key}["']?\\s*:\\s*["']([^"']+)["']`));
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
            document.getElementById('fbCfgApiKey').value = cfg.apiKey;
            document.getElementById('fbCfgProjectId').value = cfg.projectId;
            if (cfg.authDomain) document.getElementById('fbCfgAuthDomain').value = cfg.authDomain;
            if (cfg.appId) document.getElementById('fbCfgAppId').value = cfg.appId;
            showToast('✅ Configuration detected and populated!', 'success');
          } else {
            showToast('Could not find apiKey and projectId in snippet.', 'error');
          }
        } catch (err) {
          showToast('Invalid JSON format: ' + err.message, 'error');
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
        openConfigTab();
      });
    }

    // Initial Firebase startup check
    initFirebase();
  }

  // Run DOM init after document ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDOM);
  } else {
    initDOM();
  }

  // ==========================================
  // EXPORT TO GLOBAL SCOPE
  // ==========================================
  window.CloudSync = {
    initFirebase,
    isUserLoggedIn: () => !!currentUser,
    getCurrentUser: () => currentUser,
    queueCloudSave,
    uploadCurrentWorkspaceToCloud,
    openAuthModal,
    openConfigTab,
    signOut
  };
})();
