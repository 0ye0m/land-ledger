import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/index.js';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="min-h-screen grid place-items-center bg-background site-noise px-6">
      <div className="text-center max-w-md">
        <span className="inline-grid place-items-center w-12 h-12 rounded-md border border-border bg-card text-muted-foreground mb-4">
          <Compass size={20} />
        </span>
        <p className="eyebrow">404 — record not found</p>
        <h1 className="page-title text-[32px] mt-3">This page is not in the registry.</h1>
        <p className="muted text-[14px] mt-3 leading-relaxed">
          The page you requested does not exist or has been moved. Return to a familiar record room.
        </p>
        <div className="flex justify-center gap-3 mt-6">
          <Link to="/" className="btn btn-primary">
            Back to homepage
          </Link>
          <Link to="/login" className="btn btn-secondary">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
