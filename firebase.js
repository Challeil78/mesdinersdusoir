import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  linkWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut as fbSignOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─────────────────────────────────────────────
// ⚠️  REMPLACEZ CES VALEURS par votre config Firebase
//     Console Firebase → Paramètres du projet → Vos applications
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "VOTRE_API_KEY",
  authDomain:        "VOTRE_PROJECT.firebaseapp.com",
  projectId:         "VOTRE_PROJECT_ID",
  storageBucket:     "VOTRE_PROJECT.appspot.com",
  messagingSenderId: "VOTRE_MESSAGING_ID",
  appId:             "VOTRE_APP_ID"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentUser  = null;
let syncTimeout  = null;

// ─────────────────────────────────────────────
// Sync vers Firestore (debouncée 2 s pour ne pas
// écrire à chaque petite action)
// ─────────────────────────────────────────────
window.syncToCloud = function () {
  if (!currentUser) return;
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        saved:      JSON.parse(localStorage.getItem('din_saved')   || '[]'),
        plans:      JSON.parse(localStorage.getItem('din_plans')   || '{}'),
        ratings:    JSON.parse(localStorage.getItem('din_rat')     || '{}'),
        staples:    JSON.parse(localStorage.getItem('din_staples') || '[]'),
        updatedAt:  new Date().toISOString()
      });
      flashSyncBtn('ok');
    } catch (e) {
      console.error('[Firebase] Erreur sync :', e);
      flashSyncBtn('error');
    }
  }, 2000);
};

// ─────────────────────────────────────────────
// Chargement depuis Firestore
// ─────────────────────────────────────────────
async function loadFromCloud () {
  if (!currentUser) return false;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    if (!snap.exists()) return false;
    const d = snap.data();
    if (d.saved   !== undefined) localStorage.setItem('din_saved',   JSON.stringify(d.saved));
    if (d.plans   !== undefined) localStorage.setItem('din_plans',   JSON.stringify(d.plans));
    if (d.ratings !== undefined) localStorage.setItem('din_rat',     JSON.stringify(d.ratings));
    if (d.staples !== undefined) localStorage.setItem('din_staples', JSON.stringify(d.staples));
    return true;
  } catch (e) {
    console.error('[Firebase] Erreur chargement :', e);
    return false;
  }
}

// ─────────────────────────────────────────────
// UI du bouton ☁️
// ─────────────────────────────────────────────
function updateAuthBtn (user) {
  const btn = document.getElementById('authBtn');
  if (!btn) return;
  if (!user || user.isAnonymous) {
    btn.innerHTML = '☁️';
    btn.title     = 'Se connecter avec Google pour synchroniser vos données';
    btn.style.opacity = '0.55';
  } else {
    btn.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;pointer-events:none">`
      : '👤';
    btn.title     = (user.displayName || user.email) + ' · cliquer pour se déconnecter';
    btn.style.opacity = '1';
  }
}

function flashSyncBtn (state) {
  const btn = document.getElementById('authBtn');
  if (!btn) return;
  btn.style.outline = state === 'ok'
    ? '2px solid #4A7C52'
    : '2px solid #B8430A';
  setTimeout(() => { btn.style.outline = ''; }, 1500);
}

// ─────────────────────────────────────────────
// Clic sur le bouton auth
// ─────────────────────────────────────────────
window.handleAuthClick = async function () {
  if (!currentUser || currentUser.isAnonymous) {
    // → Connexion Google (lie le compte anonyme existant)
    const provider = new GoogleAuthProvider();
    try {
      if (currentUser?.isAnonymous) {
        await linkWithPopup(currentUser, provider);
        // Données locales envoyées vers le nouveau compte lié
        await window.syncToCloud();
        toast('Connecté ! Données synchronisées ✓');
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (e) {
      if (e.code === 'auth/credential-already-in-use') {
        // Ce compte Google existe déjà — on se connecte directement
        // et on récupère ses données cloud (elles priment sur le local)
        await signInWithPopup(auth, provider);
        const loaded = await loadFromCloud();
        if (loaded) {
          window.reloadFromStorage && window.reloadFromStorage();
          toast('Données récupérées depuis le cloud ✓');
        }
      } else if (e.code !== 'auth/popup-closed-by-user') {
        toast('Connexion impossible. Réessayez.');
        console.error('[Firebase] Auth error:', e);
      }
    }
  } else {
    // → Déjà connecté avec Google : proposition de déconnexion
    if (confirm('Se déconnecter ?\n\nVos données resteront disponibles en local sur cet appareil.')) {
      await fbSignOut(auth);
      toast('Déconnecté.');
    }
  }
};

// ─────────────────────────────────────────────
// Surveillance de l'état d'auth
// ─────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    updateAuthBtn(user);

    if (!user.isAnonymous) {
      // Compte Google connecté → on charge le cloud
      const loaded = await loadFromCloud();
      if (loaded) {
        window.reloadFromStorage && window.reloadFromStorage();
      }
    }
  } else {
    // Aucun utilisateur → connexion anonyme silencieuse
    await signInAnonymously(auth);
  }
});

// ─────────────────────────────────────────────
// Petit helper toast (réutilise celui du site si dispo)
// ─────────────────────────────────────────────
function toast (msg) {
  if (typeof showToast === 'function') {
    showToast(msg);
  } else {
    // Fallback si showToast n'est pas encore chargé
    setTimeout(() => typeof showToast === 'function' && showToast(msg), 500);
  }
}
