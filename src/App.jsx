import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { useStore } from './store/useStore';
import { Layout } from './components/layout/Layout';
import { AuthView } from './components/auth/AuthView';
import { OnboardingScreen } from './components/onboarding/OnboardingScreen';
import { BrandedLoadingScreen } from './components/system/BrandedLoadingScreen';
import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const {
    theme,
    language,
    desktopModeForced,
    hasCompletedOnboarding,
    dataLoaded,
    initFromAuth,
    cleanup,
    setActiveCategory,
    setCaloriDate,
  } = useStore();

  const activeCategory = useStore((s) => s.activeCategory);
  const caloriDate = useStore((s) => s.caloriDate);

  // Sync route with Zustand state.
  // Route->State must run ONLY when the URL itself changed — otherwise, right
  // after goBack() (state changed, URL not yet), it re-asserts the OLD route's
  // state and traps the user on the page (the "stuck on Calori" bug).
  // We also run it on the very first render to correctly capture deep links.
  const isFirstRenderRef = useRef(true);
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const pathChanged = prevPathRef.current !== location.pathname;
    prevPathRef.current = location.pathname;
    
    const shouldRun = isFirstRenderRef.current || pathChanged;
    isFirstRenderRef.current = false;
    
    if (!shouldRun) return;
    // Route -> State
    if (location.pathname.startsWith('/settings')) {
      const activeCat = location.pathname.slice(1);
      if (activeCategory !== activeCat) {
        setActiveCategory(activeCat);
      }
    } else if (location.pathname.startsWith('/app/day/')) {
      const parts = location.pathname.split('/');
      if (parts.length === 4) {
        if (caloriDate !== parts[3]) setCaloriDate(parts[3]);
        if (activeCategory !== 'calori') setActiveCategory('calori');
      }
    }
  }, [location.pathname, activeCategory, caloriDate, setActiveCategory, setCaloriDate]);

  // State -> Route
  useEffect(() => {
    if (activeCategory.startsWith('settings')) {
      const targetPath = `/${activeCategory}`;
      if (location.pathname !== targetPath) {
        navigate(targetPath, { replace: true });
      }
    } else if (activeCategory === 'calori') {
      const targetPath = `/app/day/${caloriDate}`;
      if (location.pathname !== targetPath) {
        navigate(targetPath, { replace: true });
      }
    } else if (location.pathname !== '/') {
      navigate('/', { replace: true });
    }
    // `location.pathname` is read but intentionally excluded: the Route->State
    // effect above owns pathname changes. Including it here would ping-pong
    // navigation between the two effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, caloriDate, navigate]);

  // Firebase Auth listener. Drives subscribe/unsubscribe lifecycle on the store.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
      if (u) {
        initFromAuth(u.uid);
      } else {
        cleanup();
      }
    });
    return () => unsub();
  }, [initFromAuth, cleanup]);

  // Apply theme and language to <html>.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
  }, [language]);

  // "Request desktop site": widen the layout viewport past the 900px CSS
  // breakpoint so the desktop shell renders, then let the browser's native
  // pinch-zoom (re-enabled here) handle reading it on a narrow screen —
  // the same trick mobile browsers use for desktop-site requests.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    meta.setAttribute(
      'content',
      desktopModeForced
        ? 'width=1280, user-scalable=yes, viewport-fit=cover'
        : 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );
  }, [desktopModeForced]);

  // --- Render ---------------------------------------------------------------

  if (loadingAuth) {
    return <BrandedLoadingScreen />;
  }

  if (!user) {
    return <AuthView />;
  }

  // Logged in but the first Firestore snapshot hasn't arrived yet.
  if (!dataLoaded) {
    return <BrandedLoadingScreen />;
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingScreen />;
  }

  return <Layout />;
}

export default App;
