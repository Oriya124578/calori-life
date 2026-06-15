import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { translations } from '../../i18n/translations';

// Detect current language from Zustand's persisted state or fall back to 'he'.
// We can't use hooks in a class component so we read the store raw.
const getLang = () => {
  try {
    const raw = localStorage.getItem('calori-life-store');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.language) return parsed.state.language;
    }
  } catch { /* ignore */ }
  return document.documentElement.lang === 'en' ? 'en' : 'he';
};

// Catches render-time errors so a single broken view doesn't crash the whole app.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, lastResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // When the resetKey changes (e.g. the user navigates to a different tab),
  // clear the error so a single broken view doesn't trap the user until reload.
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.lastResetKey) {
      return { hasError: false, error: null, lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error in UI:', error, info);
    // A failed lazy-chunk import after a deploy throws a MIME/import error. Self-
    // heal by reloading once (guarded) to fetch the fresh index + chunk hashes.
    const msg = String(error?.message || '');
    const isChunkError = /MIME type|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(msg);
    if (isChunkError && !sessionStorage.getItem('cl_chunk_reloaded')) {
      sessionStorage.setItem('cl_chunk_reloaded', '1');
      window.location.reload();
    }
  }

  handleReset = () => {
    // Hard reload so a fresh index + chunks are fetched, not just a re-render.
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const lang = getLang();
      const dict = translations[lang] || translations['he'];

      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-bold text-foreground">
            {dict.somethingWentWrong || 'Something went wrong'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error?.message || 'Unexpected error.'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {dict.reloadPage || 'Reload page'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
