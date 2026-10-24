/**
 * Tasker Up! — Firebase Cloud Configuration
 * 
 * To enable cloud login and multi-device real-time sync:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a free Firebase project
 * 3. Enable Authentication (Google & Email/Password providers)
 * 4. Enable Cloud Firestore in "Production" or "Test" mode
 * 5. Add a Web App in Project Settings, copy your firebaseConfig and paste below
 * 
 * Note: You can also paste your config directly inside the Tasker Up UI
 * by clicking "Cloud Sync" -> "⚙️ Firebase Config".
 */

window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
