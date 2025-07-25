import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA5Htd61uwLI04enaMhDybo75F6vf_wqUI",
  authDomain: "upstand-8d144.firebaseapp.com",
  projectId: "upstand-8d144",
  storageBucket: "upstand-8d144.appspot.com",
  messagingSenderId: "355169068540",
  appId: "1:355169068530:web:6811c5fba68502da55fe79",
  measurementId: "G-YWZFDXQ999"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Create Google Auth Provider instance
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account' // Always show account selection
});

export default app;